/**
 * Redis Persistence Manager
 * Saves in-memory Redis state to Upstash Redis for persistence across restarts
 * Uses a dedicated Upstash key to store the full snapshot
 * 
 * This avoids filesystem (fs/path) which is not available on Vercel serverless.
 */

import { Redis } from "@upstash/redis"

const SNAPSHOT_KEY = "cts:redis_snapshot"
const BACKUP_KEY = "cts:redis_snapshot_backup"

interface RedisSnapshot {
  timestamp: string
  version: string
  data: Record<string, any>
}

let upstashClient: Redis | null = null

function getUpstashClient(): Redis {
  if (!upstashClient) {
    upstashClient = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  }
  return upstashClient
}

export class RedisPersistenceManager {
  /**
   * Save Redis state to Upstash
   */
  static async saveSnapshot(redisStore: Map<string, any>): Promise<void> {
    try {
      const client = getUpstashClient()

      // Convert store to serializable format
      const data: Record<string, any> = {}
      for (const [key, value] of redisStore) {
        data[key] = this.serializeValue(value)
      }

      const snapshot: RedisSnapshot = {
        timestamp: new Date().toISOString(),
        version: "1.0",
        data,
      }

      // Backup current snapshot before overwriting
      const existing = await client.get<string>(SNAPSHOT_KEY)
      if (existing) {
        await client.set(BACKUP_KEY, existing)
      }

      // Save new snapshot
      await client.set(SNAPSHOT_KEY, JSON.stringify(snapshot))

      console.log(`[v0] [Persistence] Saved Redis snapshot to Upstash: ${Object.keys(data).length} keys`)
    } catch (error) {
      console.error("[v0] [Persistence] Failed to save snapshot:", error)
    }
  }

  /**
   * Load Redis state from Upstash
   */
  static async loadSnapshot(): Promise<Map<string, any> | null> {
    try {
      const client = getUpstashClient()
      const raw = await client.get<string>(SNAPSHOT_KEY)

      if (!raw) {
        console.log("[v0] [Persistence] No snapshot found in Upstash - starting fresh")
        return null
      }

      const snapshot: RedisSnapshot = typeof raw === "string" ? JSON.parse(raw) : raw as any

      const store = new Map<string, any>()
      for (const [key, value] of Object.entries(snapshot.data)) {
        store.set(key, this.deserializeValue(value))
      }

      console.log(`[v0] [Persistence] Loaded Redis snapshot from Upstash: ${store.size} keys from ${snapshot.timestamp}`)
      return store
    } catch (error) {
      console.error("[v0] [Persistence] Failed to load snapshot, trying backup:", error)

      // Try backup if main fails
      try {
        const client = getUpstashClient()
        const raw = await client.get<string>(BACKUP_KEY)

        if (raw) {
          const snapshot: RedisSnapshot = typeof raw === "string" ? JSON.parse(raw) : raw as any

          const store = new Map<string, any>()
          for (const [key, value] of Object.entries(snapshot.data)) {
            store.set(key, this.deserializeValue(value))
          }

          console.log(`[v0] [Persistence] Recovered from backup snapshot: ${store.size} keys`)
          return store
        }
      } catch (backupError) {
        console.error("[v0] [Persistence] Backup recovery also failed:", backupError)
      }

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

      return {
        ...value,
        __type: undefined,
        value: innerValue,
      }
    }

    return value
  }

  /**
   * Schedule periodic snapshots
   */
  static startPeriodicSnapshots(redisStore: Map<string, any>, intervalMs: number = 240000): void {
    setInterval(() => {
      this.saveSnapshot(redisStore)
    }, intervalMs)

    console.log(`[v0] [Persistence] Periodic snapshots enabled (every ${intervalMs / 1000}s = ${(intervalMs / 1000 / 60).toFixed(1)}min)`)
  }
}
