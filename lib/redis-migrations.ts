/**
 * Redis Migration Runner
 * Handles schema initialization and data migrations
 */

import { getRedisClient, initRedis } from "./redis-db"

interface Migration {
  name: string
  version: number
  up: (client: any) => Promise<void>
  down: (client: any) => Promise<void>
}

const migrations: Migration[] = [
  {
    name: "001-initial-schema",
    version: 1,
    up: async (client: any) => {
      // Initialize key namespaces and schemas
      await client.set("_schema_version", "1")
      // Create all key index sets
      await client.sAdd("connections:all", "")
      await client.sAdd("trades:all", "")
      await client.sAdd("positions:all", "")
      await client.sAdd("preset_types:all", "")
      console.log("[v0] Migration 001: Initial schema created")
    },
    down: async (client: any) => {
      await client.del("_schema_version")
    },
  },
  {
    name: "002-connection-indexes",
    version: 2,
    up: async (client: any) => {
      // Create connection index patterns
      await client.set("_schema_version", "2")
      await client.set("_connections_indexed", "true")
      // Initialize exchange-specific indexes
      await client.sAdd("connections:bybit", "")
      await client.sAdd("connections:bingx", "")
      await client.sAdd("connections:pionex", "")
      await client.sAdd("connections:orangex", "")
      console.log("[v0] Migration 002: Connection indexes created")
    },
    down: async (client: any) => {
      await client.del("_connections_indexed")
      await client.set("_schema_version", "1")
    },
  },
  {
    name: "003-trade-positions-schema",
    version: 3,
    up: async (client: any) => {
      // Initialize trade and position schemas
      await client.set("_schema_version", "3")
      await client.set("_trades_initialized", "true")
      // Create trade status indexes
      await client.sAdd("trades:open", "")
      await client.sAdd("trades:closed", "")
      await client.sAdd("trades:pending", "")
      // Create position status indexes
      await client.sAdd("positions:open", "")
      await client.sAdd("positions:closed", "")
      console.log("[v0] Migration 003: Trade and position schemas created")
    },
    down: async (client: any) => {
      await client.del("_trades_initialized")
      await client.set("_schema_version", "2")
    },
  },
  {
    name: "004-performance-optimizations",
    version: 4,
    up: async (client: any) => {
      // Set up TTL policies and expiration strategies
      await client.set("_schema_version", "4")
      await client.set("_ttl_policies_set", "true")
      // Initialize system settings
      await client.hSet("system:config", {
        database_type: "redis",
        initialized_at: new Date().toISOString(),
        version: "3.2",
      })
      console.log("[v0] Migration 004: TTL policies and expiration configured")
    },
    down: async (client: any) => {
      await client.del("_ttl_policies_set")
      await client.set("_schema_version", "3")
    },
  },
  {
    name: "005-settings-and-metadata",
    version: 5,
    up: async (client: any) => {
      // Initialize system settings namespace
      await client.set("_schema_version", "5")
      await client.hSet("settings:system", {
        trade_engine_enabled: "true",
        auto_migration: "true",
        fallback_mode: "memory",
      })
      // Initialize migration metadata
      await client.set("_migration_last_run", new Date().toISOString())
      console.log("[v0] Migration 005: Settings and metadata initialized")
    },
    down: async (client: any) => {
      await client.del("_migration_last_run")
      await client.set("_schema_version", "4")
    },
  },
]

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  try {
    await initRedis()
    const client = getRedisClient()

    // Get current schema version
    const versionStr = await client.get("_schema_version")
    const currentVersion = versionStr ? parseInt(versionStr) : 0

    console.log(`[v0] Current Redis schema version: ${currentVersion}`)

    // Run pending migrations
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        console.log(`[v0] Running migration: ${migration.name}`)
        await migration.up(client)
      }
    }

    // Update final schema version
    const finalVersion = Math.max(...migrations.map((m) => m.version))
    await client.set("_schema_version", finalVersion.toString())

    console.log(`[v0] Redis schema migrated to version ${finalVersion}`)
  } catch (error) {
    console.error("[v0] Migration failed:", error)
    throw error
  }
}

/**
 * Rollback to previous migration
 */
export async function rollbackMigration(): Promise<void> {
  try {
    await initRedis()
    const client = getRedisClient()

    const versionStr = await client.get("_schema_version")
    const currentVersion = versionStr ? parseInt(versionStr) : 0

    if (currentVersion === 0) {
      console.log("[v0] No migrations to rollback")
      return
    }

    // Find current migration and rollback
    const migrationToRollback = migrations.find((m) => m.version === currentVersion)

    if (migrationToRollback) {
      console.log(`[v0] Rolling back migration: ${migrationToRollback.name}`)
      await migrationToRollback.down(client)
    }

    console.log(`[v0] Rolled back to version ${currentVersion - 1}`)
  } catch (error) {
    console.error("[v0] Rollback failed:", error)
    throw error
  }
}

/**
 * Get migration status
 */
export async function getMigrationStatus(): Promise<any> {
  try {
    await initRedis()
    const client = getRedisClient()

    const versionStr = await client.get("_schema_version")
    const currentVersion = versionStr ? parseInt(versionStr) : 0
    const latestVersion = Math.max(...migrations.map((m) => m.version))

    return {
      currentVersion,
      latestVersion,
      isMigrated: currentVersion === latestVersion,
      pendingMigrations: migrations.filter((m) => m.version > currentVersion),
    }
  } catch (error) {
    console.error("[v0] Could not get migration status:", error)
    return {
      currentVersion: 0,
      latestVersion: Math.max(...migrations.map((m) => m.version)),
      isMigrated: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
