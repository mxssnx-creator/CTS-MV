/**
 * Redis Persistence Manager
 * Saves Redis state to JSON files for persistence across restarts
 * Automatically creates snapshots and restores on startup
 */

import fs from "fs"
import path from "path"

const SNAPSHOTS_DIR = path.join(process.cwd(), ".data")
const MAIN_SNAPSHOT = path.join(SNAPSHOTS_DIR, "redis-snapshot.json")
const BACKUP_SNAPSHOT = path.join(SNAPSHOTS_DIR, "redis-snapshot.backup.json")

interface RedisSnapshot {
  timestamp: string
  version: string
  data: Record<string, any>
}

export class RedisPersistenceManager {
  /**
   * Save Redis state to file
   */
  static async saveSnapshot(redisStore: Map<string, any>): Promise<void> {
    try {
      // Ensure directory exists
      if (!fs.existsSync(SNAPSHOTS_DIR)) {
        fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true })
      }

      // Create backup of existing snapshot
      if (fs.existsSync(MAIN_SNAPSHOT)) {
        fs.copyFileSync(MAIN_SNAPSHOT, BACKUP_SNAPSHOT)
      }

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

      // Write snapshot atomically
      const tempFile = MAIN_SNAPSHOT + ".tmp"
      fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2))
      fs.renameSync(tempFile, MAIN_SNAPSHOT)

      console.log(`[v0] [Persistence] Saved Redis snapshot: ${Object.keys(data).length} keys`)
    } catch (error) {
      console.error("[v0] [Persistence] Failed to save snapshot:", error)
    }
  }

  /**
   * Load Redis state from file
   */
  static async loadSnapshot(): Promise<Map<string, any> | null> {
    try {
      if (!fs.existsSync(MAIN_SNAPSHOT)) {
        console.log("[v0] [Persistence] No snapshot found - starting fresh")
        return null
      }

      const content = fs.readFileSync(MAIN_SNAPSHOT, "utf-8")
      const snapshot: RedisSnapshot = JSON.parse(content)

      const store = new Map<string, any>()
      for (const [key, value] of Object.entries(snapshot.data)) {
        store.set(key, this.deserializeValue(value))
      }

      console.log(`[v0] [Persistence] Loaded Redis snapshot: ${store.size} keys from ${snapshot.timestamp}`)
      return store
    } catch (error) {
      console.error("[v0] [Persistence] Failed to load snapshot, trying backup:", error)

      // Try backup if main fails
      try {
        if (fs.existsSync(BACKUP_SNAPSHOT)) {
          const content = fs.readFileSync(BACKUP_SNAPSHOT, "utf-8")
          const snapshot: RedisSnapshot = JSON.parse(content)

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
   * Clean up snapshots (keep only recent ones)
   */
  static async cleanupOldSnapshots(): Promise<void> {
    try {
      if (!fs.existsSync(SNAPSHOTS_DIR)) return

      const files = fs.readdirSync(SNAPSHOTS_DIR)
      const snapshots = files.filter((f) => f.startsWith("redis-snapshot"))

      // Keep only main + backup
      const toDelete = snapshots.filter((f) => !f.includes(".backup") && f !== "redis-snapshot.json")
      for (const file of toDelete) {
        fs.unlinkSync(path.join(SNAPSHOTS_DIR, file))
      }

      console.log(`[v0] [Persistence] Cleanup: removed ${toDelete.length} old snapshots`)
    } catch (error) {
      console.error("[v0] [Persistence] Cleanup failed:", error)
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
  static startPeriodicSnapshots(redisStore: Map<string, any>, intervalMs: number = 60000): void {
    setInterval(() => {
      this.saveSnapshot(redisStore)
    }, intervalMs)

    console.log(`[v0] [Persistence] Periodic snapshots enabled (every ${intervalMs / 1000}s)`)
  }
}
