/**
 * Redis Migration Runner - Complete System
 * Handles schema initialization and data migrations for all system components
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
      // Initialize all key namespaces
      await client.set("_schema_version", "1")
      
      // Connection management indexes
      await client.sAdd("connections:all", "")
      await client.sAdd("connections:bybit", "")
      await client.sAdd("connections:bingx", "")
      await client.sAdd("connections:pionex", "")
      await client.sAdd("connections:orangex", "")
      await client.sAdd("connections:active", "")
      await client.sAdd("connections:inactive", "")
      
      // Trade and position tracking
      await client.sAdd("trades:all", "")
      await client.sAdd("trades:open", "")
      await client.sAdd("trades:closed", "")
      await client.sAdd("trades:pending", "")
      await client.sAdd("positions:all", "")
      await client.sAdd("positions:open", "")
      await client.sAdd("positions:closed", "")
      
      // User and authentication
      await client.sAdd("users:all", "")
      await client.sAdd("sessions:all", "")
      
      // Presets and strategies
      await client.sAdd("presets:all", "")
      await client.sAdd("preset_types:all", "")
      await client.sAdd("strategies:all", "")
      await client.sAdd("strategies:active", "")
      
      // Monitoring and logging
      await client.sAdd("monitoring:events", "")
      await client.sAdd("logs:system", "")
      await client.sAdd("logs:trades", "")
      await client.sAdd("logs:errors", "")
      
      console.log("[v0] Migration 001: Initial schema created")
    },
    down: async (client: any) => {
      await client.del("_schema_version")
    },
  },
  {
    name: "002-connection-management",
    version: 2,
    up: async (client: any) => {
      await client.set("_schema_version", "2")
      await client.set("_connections_indexed", "true")
      
      // Connection metadata structure
      await client.hSet("connections:metadata", {
        total_configured: "0",
        total_active: "0",
        total_errors: "0",
        last_sync: new Date().toISOString(),
      })
      
      // Exchange-specific metadata
      for (const exchange of ["bybit", "bingx", "pionex", "orangex"]) {
        await client.hSet(`exchange:${exchange}:metadata`, {
          name: exchange,
          api_calls_used: "0",
          api_rate_limit: "0",
          last_updated: new Date().toISOString(),
        })
      }
      
      console.log("[v0] Migration 002: Connection management structure created")
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
      await client.set("_schema_version", "3")
      await client.set("_trades_initialized", "true")
      
      // Trade tracking metadata
      await client.hSet("trades:metadata", {
        total_trades: "0",
        total_open: "0",
        total_closed: "0",
        total_win: "0",
        total_loss: "0",
        total_profit: "0",
        avg_profit: "0",
        win_rate: "0",
        last_trade_time: "",
      })
      
      // Position tracking metadata
      await client.hSet("positions:metadata", {
        total_positions: "0",
        total_open_positions: "0",
        total_closed_positions: "0",
        total_contracts: "0",
        total_collateral: "0",
        total_pnl: "0",
        avg_leverage: "0",
      })
      
      // Trade status counters
      await client.set("trades:counter:open", "0")
      await client.set("trades:counter:closed", "0")
      await client.set("trades:counter:pending", "0")
      
      // Position status counters
      await client.set("positions:counter:open", "0")
      await client.set("positions:counter:closed", "0")
      
      console.log("[v0] Migration 003: Trade and position schemas created")
    },
    down: async (client: any) => {
      await client.del("_trades_initialized")
      await client.set("_schema_version", "2")
    },
  },
  {
    name: "004-preset-strategy-management",
    version: 4,
    up: async (client: any) => {
      await client.set("_schema_version", "4")
      await client.set("_presets_initialized", "true")
      
      // Preset tracking metadata
      await client.hSet("presets:metadata", {
        total_presets: "0",
        total_active: "0",
        total_inactive: "0",
        total_runs: "0",
        avg_success_rate: "0",
      })
      
      // Strategy tracking metadata
      await client.hSet("strategies:metadata", {
        total_strategies: "0",
        total_active_strategies: "0",
        total_backtests: "0",
        avg_win_rate: "0",
        avg_profit_factor: "0",
      })
      
      // Preset type indexes
      await client.sAdd("preset_types:standard", "")
      await client.sAdd("preset_types:advanced", "")
      await client.sAdd("preset_types:custom", "")
      
      // Strategy status tracking
      await client.set("strategies:counter:active", "0")
      await client.set("strategies:counter:paused", "0")
      await client.set("strategies:counter:stopped", "0")
      
      console.log("[v0] Migration 004: Preset and strategy management created")
    },
    down: async (client: any) => {
      await client.del("_presets_initialized")
      await client.set("_schema_version", "3")
    },
  },
  {
    name: "005-user-authentication",
    version: 5,
    up: async (client: any) => {
      await client.set("_schema_version", "5")
      await client.set("_auth_initialized", "true")
      
      // User metadata
      await client.hSet("users:metadata", {
        total_users: "1",
        total_active_sessions: "0",
        last_login: new Date().toISOString(),
      })
      
      // Session management
      await client.hSet("sessions:metadata", {
        total_sessions: "0",
        active_sessions: "0",
        expired_sessions: "0",
      })
      
      // Default admin user setup
      const adminId = "admin-001"
      await client.hSet(`user:${adminId}`, {
        id: adminId,
        username: "admin",
        email: "admin@trading-engine.local",
        role: "admin",
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        status: "active",
        api_keys_count: "0",
      })
      
      await client.sAdd("users:all", adminId)
      await client.sAdd("users:admin", adminId)
      
      console.log("[v0] Migration 005: User authentication system created")
    },
    down: async (client: any) => {
      await client.del("_auth_initialized")
      await client.set("_schema_version", "4")
    },
  },
  {
    name: "006-monitoring-logging",
    version: 6,
    up: async (client: any) => {
      await client.set("_schema_version", "6")
      await client.set("_monitoring_initialized", "true")
      
      // Monitoring metadata
      await client.hSet("monitoring:metadata", {
        total_events: "0",
        critical_events: "0",
        warning_events: "0",
        info_events: "0",
        last_event_time: new Date().toISOString(),
      })
      
      // System health tracking
      await client.hSet("system:health", {
        status: "healthy",
        uptime_seconds: "0",
        memory_usage: "0",
        cpu_usage: "0",
        last_check: new Date().toISOString(),
      })
      
      // Performance metrics
      await client.hSet("system:performance", {
        avg_response_time: "0",
        trades_per_minute: "0",
        api_calls_per_minute: "0",
        errors_per_hour: "0",
      })
      
      // Logging indexes with TTL
      await client.set("logs:system:counter", "0")
      await client.set("logs:trades:counter", "0")
      await client.set("logs:errors:counter", "0")
      
      console.log("[v0] Migration 006: Monitoring and logging system created")
    },
    down: async (client: any) => {
      await client.del("_monitoring_initialized")
      await client.set("_schema_version", "5")
    },
  },
  {
    name: "007-cache-optimization",
    version: 7,
    up: async (client: any) => {
      await client.set("_schema_version", "7")
      await client.set("_cache_optimized", "true")
      
      // Cache configuration
      await client.hSet("cache:config", {
        connection_cache_ttl: "3600",
        trade_cache_ttl: "1800",
        position_cache_ttl: "900",
        strategy_cache_ttl: "7200",
        monitoring_cache_ttl: "300",
      })
      
      // Cache hit/miss tracking
      await client.hSet("cache:stats", {
        total_hits: "0",
        total_misses: "0",
        hit_rate: "0",
        total_evictions: "0",
      })
      
      // Real-time data cache indexes
      await client.sAdd("cache:realtime:prices", "")
      await client.sAdd("cache:realtime:positions", "")
      await client.sAdd("cache:realtime:orders", "")
      await client.sAdd("cache:realtime:balances", "")
      
      console.log("[v0] Migration 007: Cache optimization created")
    },
    down: async (client: any) => {
      await client.del("_cache_optimized")
      await client.set("_schema_version", "6")
    },
  },
  {
    name: "008-performance-optimizations",
    version: 8,
    up: async (client: any) => {
      await client.set("_schema_version", "8")
      await client.set("_ttl_policies_set", "true")
      
      // System configuration
      await client.hSet("system:config", {
        database_type: "redis",
        initialized_at: new Date().toISOString(),
        version: "3.2",
        environment: "production",
        log_level: "info",
      })
      
      // Performance thresholds
      await client.hSet("system:thresholds", {
        max_concurrent_trades: "1000",
        max_api_calls_per_minute: "6000",
        max_positions_per_connection: "500",
        max_connections: "100",
        memory_limit_mb: "1024",
      })
      
      // Rate limiting configuration
      await client.hSet("ratelimit:config", {
        trades_per_second: "100",
        api_calls_per_second: "200",
        batch_operations_per_second: "50",
      })
      
      console.log("[v0] Migration 008: Performance optimizations configured")
    },
    down: async (client: any) => {
      await client.del("_ttl_policies_set")
      await client.set("_schema_version", "7")
    },
  },
  {
    name: "009-backup-recovery",
    version: 9,
    up: async (client: any) => {
      await client.set("_schema_version", "9")
      await client.set("_backup_initialized", "true")
      
      // Backup metadata
      await client.hSet("backup:metadata", {
        last_backup_time: "",
        last_backup_size: "0",
        total_backups: "0",
        backup_retention_days: "30",
        auto_backup_enabled: "true",
      })
      
      // Recovery point tracking
      await client.hSet("recovery:points", {
        total_recovery_points: "0",
        last_recovery_time: "",
        last_recovery_success: "false",
      })
      
      // Snapshots for critical data
      await client.sAdd("snapshots:trades", "")
      await client.sAdd("snapshots:positions", "")
      await client.sAdd("snapshots:connections", "")
      await client.sAdd("snapshots:strategies", "")
      
      console.log("[v0] Migration 009: Backup and recovery system created")
    },
    down: async (client: any) => {
      await client.del("_backup_initialized")
      await client.set("_schema_version", "8")
    },
  },
  {
    name: "010-settings-and-metadata",
    version: 10,
    up: async (client: any) => {
      await client.set("_schema_version", "10")
      
      // System settings namespace
      await client.hSet("settings:system", {
        trade_engine_enabled: "true",
        auto_migration: "true",
        fallback_mode: "memory",
        theme: "dark",
        timezone: "UTC",
        language: "en",
      })
      
      // Trading settings
      await client.hSet("settings:trading", {
        default_leverage: "1",
        max_leverage: "20",
        default_take_profit_percent: "2",
        default_stop_loss_percent: "1",
        max_position_size: "100000",
      })
      
      // API settings
      await client.hSet("settings:api", {
        api_version: "v1",
        rate_limit_enabled: "true",
        cors_enabled: "true",
        request_timeout_seconds: "30",
      })
      
      // Migration and deployment metadata
      await client.set("_migration_last_run", new Date().toISOString())
      await client.set("_migration_total_runs", "0")
      
      // Feature flags
      await client.hSet("features:enabled", {
        live_trading: "false",
        paper_trading: "true",
        backtesting: "true",
        strategy_optimization: "true",
        ai_recommendations: "false",
      })
      
      console.log("[v0] Migration 010: Settings and metadata finalized")
    },
    down: async (client: any) => {
      await client.del("_migration_last_run")
      await client.set("_schema_version", "9")
    },
  },
  {
    name: "011-seed-predefined-connections",
    version: 11,
    up: async (client: any) => {
      await client.set("_schema_version", "11")
      
      // Import and seed predefined connections
      const { getPredefinedConnectionsAsStatic } = await import("./connection-predefinitions")
      const { createConnection, getConnection } = await import("./redis-db")
      
      const predefinedConnections = getPredefinedConnectionsAsStatic()
      let seededCount = 0
      
      for (const connection of predefinedConnections) {
        try {
          // Check if connection already exists using getConnection
          const existing = await getConnection(connection.id)
          
          if (!existing) {
            // Ensure enabled connections are also active for trade engine auto-start
            const connectionData = {
              ...connection,
              is_active: connection.is_enabled !== false, // Active if enabled
            }
            await createConnection(connectionData)
            console.log(`[v0] Seeded predefined connection: ${connection.name} (enabled: ${connection.is_enabled}, active: ${connectionData.is_active})`)
            seededCount++
          }
        } catch (error) {
          console.warn(`[v0] Failed to seed connection ${connection.name}:`, error instanceof Error ? error.message : "unknown")
        }
      }
      
      console.log(`[v0] Migration 011: Seeded ${seededCount}/${predefinedConnections.length} predefined connections`)
    },
    down: async (client: any) => {
      await client.set("_schema_version", "10")
    },
  },
]

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<{ success: boolean; message: string; version: number }> {
  try {
    console.log("[v0] [Migrations] ==========================================")
    console.log("[v0] [Migrations] Starting Redis database migrations...")
    console.log("[v0] [Migrations] ==========================================")
    
    await initRedis()
    const client = getRedisClient()

    // Get current schema version
    const versionStr = await client.get("_schema_version")
    const currentVersion = versionStr ? parseInt(versionStr) : 0
    const finalVersion = Math.max(...migrations.map((m) => m.version))
    const totalMigrations = migrations.length

    console.log(`[v0] [Migrations] Current schema version: ${currentVersion}`)
    console.log(`[v0] [Migrations] Target schema version: ${finalVersion}`)
    console.log(`[v0] [Migrations] Total migrations available: ${totalMigrations}`)

    // Run pending migrations
    const pendingMigrations = migrations.filter((m) => m.version > currentVersion)
    
    if (pendingMigrations.length === 0) {
      console.log("[v0] [Migrations] ✓ Database already at latest version")
      console.log("[v0] [Migrations] ==========================================")
      return {
        success: true,
        message: `Already at latest version ${currentVersion}`,
        version: currentVersion,
      }
    }

    console.log(`[v0] [Migrations] Found ${pendingMigrations.length} pending migrations to apply`)
    console.log("[v0] [Migrations] ==========================================")

    for (let i = 0; i < pendingMigrations.length; i++) {
      const migration = pendingMigrations[i]
      console.log(`[v0] [Migrations] [${i + 1}/${pendingMigrations.length}] Running: ${migration.name} (v${migration.version})`)
      
      try {
        await migration.up(client)
        console.log(`[v0] [Migrations] ✓ Migration ${migration.version} completed successfully`)
      } catch (error) {
        console.error(`[v0] [Migrations] ✗ Migration ${migration.version} failed:`, error)
        throw error
      }
    }

    // Update final schema version
    await client.set("_schema_version", finalVersion.toString())

    // Increment migration run counter
    const runCount = await client.get("_migration_total_runs")
    const newRunCount = (parseInt(runCount || "0") + 1).toString()
    await client.set("_migration_total_runs", newRunCount)
    await client.set("_migration_last_run", new Date().toISOString())

    console.log("[v0] [Migrations] ==========================================")
    console.log(`[v0] [Migrations] ✓ Successfully migrated from version ${currentVersion} to ${finalVersion}`)
    console.log(`[v0] [Migrations] ✓ Total migration runs: ${newRunCount}`)
    console.log("[v0] [Migrations] ==========================================")
    
    return {
      success: true,
      message: `Successfully migrated from version ${currentVersion} to ${finalVersion}`,
      version: finalVersion,
    }
  } catch (error) {
    console.error("[v0] [Migrations] ==========================================")
    console.error("[v0] [Migrations] ✗ Migration failed:", error)
    console.error("[v0] [Migrations] ==========================================")
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
