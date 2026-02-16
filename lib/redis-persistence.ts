/**
 * Redis Persistence Manager
 * Saves in-memory Redis state to Upstash Redis for persistence across restarts.
 * 
 * Gracefully degrades when Upstash rate limits are hit:
 * - Falls back to in-memory only operation (no crash)
 * - Retries persistence after a cooldown period
 * - Skips backup rotation when rate-limited to reduce API calls
 */

import { Redis } from "@upstash/redis"

const SNAPSHOT_KEY = "cts:redis_snapshot"

interface RedisSnapshot {
  timestamp: string
  version: string
  data: Record<string, any>
}

let upstashClient: Redis | null = null
let rateLimitHit = false
let rateLimitCooldownUntil = 0

function getUpstashClient(): Redis | null {
  // If rate limit was hit, check cooldown (15 minutes)
  if (rateLimitHit) {
    if (Date.now() < rateLimitCooldownUntil) {
      return null // Still in cooldown
    }
    // Cooldown expired, try again
    rateLimitHit = false
    console.log("[v0] [Persistence] Rate limit cooldown expired, retrying Upstash connection")
  }

  if (!upstashClient) {
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN
    
    if (!url || !token) {
      console.warn("[v0] [Persistence] Upstash credentials not configured - running in-memory only")
      return null
    }
    
    upstashClient = new Redis({ url, token })
  }
  return upstashClient
}

function handleRateLimit(error: any): boolean {
  const msg = String(error?.message || error || "")
  if (msg.includes("max requests limit exceeded") || msg.includes("ERR max requests")) {
    rateLimitHit = true
    rateLimitCooldownUntil = Date.now() + 15 * 60 * 1000 // 15 min cooldown
    console.warn("[v0] [Persistence] Upstash rate limit hit - falling back to in-memory only for 15 minutes")
    return true
  }
  return false
}

export class RedisPersistenceManager {
  /**
   * Save Redis state to Upstash (single API call, no backup rotation)
   */
  static async saveSnapshot(redisStore: Map<string, any>): Promise<void> {
    const client = getUpstashClient()
    if (!client) return // Rate limited or no credentials - skip silently

    try {
      const data: Record<string, any> = {}
      for (const [key, value] of redisStore) {
        data[key] = this.serializeValue(value)
      }

      const snapshot: RedisSnapshot = {
        timestamp: new Date().toISOString(),
        version: "1.0",
        data,
      }

      // Single API call - no backup rotation to conserve request quota
      await client.set(SNAPSHOT_KEY, JSON.stringify(snapshot))

      console.log(`[v0] [Persistence] Snapshot saved: ${Object.keys(data).length} keys`)
    } catch (error) {
      if (handleRateLimit(error)) return
      console.error("[v0] [Persistence] Failed to save snapshot:", error)
    }
  }

  /**
   * Load Redis state from Upstash (single API call)
   */
  static async loadSnapshot(): Promise<Map<string, any> | null> {
    const client = getUpstashClient()
    if (!client) {
      console.log("[v0] [Persistence] No Upstash client available - starting with fresh in-memory store")
      return null
    }

    try {
      const raw = await client.get<string>(SNAPSHOT_KEY)

      if (!raw) {
        console.log("[v0] [Persistence] No snapshot found - starting fresh")
        return null
      }

      const snapshot: RedisSnapshot = typeof raw === "string" ? JSON.parse(raw) : raw as any

      const store = new Map<string, any>()
      for (const [key, value] of Object.entries(snapshot.data)) {
        store.set(key, this.deserializeValue(value))
      }

      console.log(`[v0] [Persistence] Loaded snapshot: ${store.size} keys from ${snapshot.timestamp}`)
      return store
    } catch (error) {
      if (handleRateLimit(error)) {
        console.log("[v0] [Persistence] Rate limited on load - starting with fresh in-memory store")
        return null
      }
      console.error("[v0] [Persistence] Failed to load snapshot:", error)
      return null
    }
  }

  /**
   * Serialize values for JSON storage
   */
  private static serializeValue(value: any): any {
    if (value instanceof Map) {
      return { __type: "map", value: Array.from(value.entries()) }
    }
    if (value instanceof Set) {
      return { __type: "set", value: Array.from(value) }
    }
    if (value && typeof value === "object" && value.expiresAt) {
      return {
        ...value,
        __type: "redisValue",
        value:
          value.value instanceof Set
            ? { __type: "set", value: Array.from(value.value) }
            : value.value instanceof Map
              ? { __type: "map", value: Array.from(value.value.entries()) }
              : value.value,
      }
    }
    return value
  }

  /**
   * Deserialize values from JSON storage
   */
  private static deserializeValue(value: any): any {
    if (!value || typeof value !== "object") return value

    if (value.__type === "map") {
      return new Map(value.value)
    }
    if (value.__type === "set") {
      return new Set(value.value)
    }
    if (value.__type === "redisValue") {
      const innerValue =
        value.value?.__type === "set"
          ? new Set(value.value.value)
          : value.value?.__type === "map"
            ? new Map(value.value.value)
            : value.value

      return { ...value, __type: undefined, value: innerValue }
    }

    return value
  }

  /**
   * Schedule periodic snapshots (default: every 4 minutes)
   */
  static startPeriodicSnapshots(redisStore: Map<string, any>, intervalMs: number = 240000): void {
    setInterval(() => {
      this.saveSnapshot(redisStore)
    }, intervalMs)

    console.log(`[v0] [Persistence] Periodic snapshots enabled (every ${(intervalMs / 1000 / 60).toFixed(1)}min)`)
  }
}
