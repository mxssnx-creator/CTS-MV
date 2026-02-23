/**
 * Redis Persistence Manager - Syncs critical keys to/from Upstash REST API
 * Uses Upstash for persistent state (trade engine status, connection states)
 * Falls back to in-memory only if Upstash is not configured
 */

const UPSTASH_URL = process.env.KV_REST_API_URL || ""
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN || ""

// Keys that MUST be persisted to Upstash for cross-request state
const PERSISTENT_KEY_PREFIXES = [
  "trade_engine:",
  "connection:",
  "connections",
  "_schema_version",
]

function isPersistentKey(key: string): boolean {
  return PERSISTENT_KEY_PREFIXES.some(p => key.startsWith(p) || key === p)
}

async function upstashCommand(command: string[]): Promise<any> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null
  try {
    const res = await fetch(`${UPSTASH_URL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.result
  } catch {
    return null
  }
}

export class UpstashSync {
  /**
   * Write a hash to Upstash
   */
  static async hset(key: string, fields: Record<string, string>): Promise<void> {
    if (!isPersistentKey(key)) return
    const args: string[] = ["HSET", key]
    for (const [f, v] of Object.entries(fields)) {
      args.push(f, String(v))
    }
    await upstashCommand(args)
  }

  /**
   * Read a hash from Upstash
   */
  static async hgetall(key: string): Promise<Record<string, string> | null> {
    if (!UPSTASH_URL || !UPSTASH_TOKEN) return null
    const result = await upstashCommand(["HGETALL", key])
    if (!result || !Array.isArray(result) || result.length === 0) return null
    const obj: Record<string, string> = {}
    for (let i = 0; i < result.length; i += 2) {
      obj[result[i]] = result[i + 1]
    }
    return obj
  }

  /**
   * Write a string to Upstash
   */
  static async set(key: string, value: string): Promise<void> {
    if (!isPersistentKey(key)) return
    await upstashCommand(["SET", key, value])
  }

  /**
   * Read a string from Upstash
   */
  static async get(key: string): Promise<string | null> {
    if (!UPSTASH_URL || !UPSTASH_TOKEN) return null
    const result = await upstashCommand(["GET", key])
    return result ?? null
  }
}

export class RedisPersistenceManager {
  static async saveSnapshot(redisStore: Map<string, any>): Promise<void> {
    const size = redisStore.size
    if (size > 0) {
      console.log(`[v0] [Persistence] In-memory store: ${size} keys`)
    }
  }

  static async loadSnapshot(): Promise<Map<string, any> | null> {
    console.log("[v0] [Persistence] Starting with in-memory store + Upstash sync for persistent keys")
    return null
  }

  static startPeriodicSnapshots(redisStore: Map<string, any>, intervalMs: number = 240000): void {
    setInterval(() => {
      const size = redisStore.size
      if (size > 0) {
        console.log(`[v0] [Persistence] In-memory store active: ${size} keys`)
      }
    }, intervalMs)
  }
}
