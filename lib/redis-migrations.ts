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
      await client.sadd("connections:all", "")
      await client.sadd("connections:bybit", "")
      await client.sadd("connections:bingx", "")
      await client.sadd("connections:pionex", "")
      await client.sadd("connections:orangex", "")
      await client.sadd("connections:active", "")
      await client.sadd("connections:inactive", "")
      
      // Trade and position tracking
      await client.sadd("trades:all", "")
      await client.sadd("trades:open", "")
      await client.sadd("trades:closed", "")
      await client.sadd("trades:pending", "")
      await client.sadd("positions:all", "")
      await client.sadd("positions:open", "")
      await client.sadd("positions:closed", "")
      
      // User and authentication
      await client.sadd("users:all", "")
      await client.sadd("sessions:all", "")
      
      // Presets and strategies
      await client.sadd("presets:all", "")
      await client.sadd("preset_types:all", "")
      await client.sadd("strategies:all", "")
      await client.sadd("strategies:active", "")
      
      // Monitoring and logging
      await client.sadd("monitoring:events", "")
      await client.sadd("logs:system", "")
      await client.sadd("logs:trades", "")
      await client.sadd("logs:errors", "")
      
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
      await client.hset("connections:metadata", {
        total_configured: "0",
        total_active: "0",
        total_errors: "0",
        last_sync: new Date().toISOString(),
      })
      
      // Exchange-specific metadata
      for (const exchange of ["bybit", "bingx", "pionex", "orangex"]) {
        await client.hset(`exchange:${exchange}:metadata`, {
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
      await client.hset("trades:metadata", {
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
      await client.hset("positions:metadata", {
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
      await client.hset("presets:metadata", {
        total_presets: "0",
        total_active: "0",
        total_inactive: "0",
        total_runs: "0",
        avg_success_rate: "0",
      })
      
      // Strategy tracking metadata
      await client.hset("strategies:metadata", {
        total_strategies: "0",
        total_active_strategies: "0",
        total_backtests: "0",
        avg_win_rate: "0",
        avg_profit_factor: "0",
      })
      
      // Preset type indexes
      await client.sadd("preset_types:standard", "")
      await client.sadd("preset_types:advanced", "")
      await client.sadd("preset_types:custom", "")
      
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
      await client.hset("users:metadata", {
        total_users: "1",
        total_active_sessions: "0",
        last_login: new Date().toISOString(),
      })
      
      // Session management
      await client.hset("sessions:metadata", {
        total_sessions: "0",
        active_sessions: "0",
        expired_sessions: "0",
      })
      
      // Default admin user setup
      const adminId = "admin-001"
      await client.hset(`user:${adminId}`, {
        id: adminId,
        username: "admin",
        email: "admin@trading-engine.local",
        role: "admin",
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        status: "active",
        api_keys_count: "0",
      })
      
      await client.sadd("users:all", adminId)
      await client.sadd("users:admin", adminId)
      
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
      await client.hset("monitoring:metadata", {
        total_events: "0",
        critical_events: "0",
        warning_events: "0",
        info_events: "0",
        last_event_time: new Date().toISOString(),
      })
      
      // System health tracking
      await client.hset("system:health", {
        status: "healthy",
        uptime_seconds: "0",
        memory_usage: "0",
        cpu_usage: "0",
        last_check: new Date().toISOString(),
      })
      
      // Performance metrics
      await client.hset("system:performance", {
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
      await client.hset("cache:config", {
        connection_cache_ttl: "3600",
        trade_cache_ttl: "1800",
        position_cache_ttl: "900",
        strategy_cache_ttl: "7200",
        monitoring_cache_ttl: "300",
      })
      
      // Cache hit/miss tracking
      await client.hset("cache:stats", {
        total_hits: "0",
        total_misses: "0",
        hit_rate: "0",
        total_evictions: "0",
      })
      
      // Real-time data cache indexes
      await client.sadd("cache:realtime:prices", "")
      await client.sadd("cache:realtime:positions", "")
      await client.sadd("cache:realtime:orders", "")
      await client.sadd("cache:realtime:balances", "")
      
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
      await client.hset("system:config", {
        database_type: "redis",
        initialized_at: new Date().toISOString(),
        version: "3.2",
        environment: "production",
        log_level: "info",
      })
      
      // Performance thresholds
      await client.hset("system:thresholds", {
        max_concurrent_trades: "1000",
        max_api_calls_per_minute: "6000",
        max_positions_per_connection: "500",
        max_connections: "100",
        memory_limit_mb: "1024",
      })
      
      // Rate limiting configuration
      await client.hset("ratelimit:config", {
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
      await client.hset("backup:metadata", {
        last_backup_time: "",
        last_backup_size: "0",
        total_backups: "0",
        backup_retention_days: "30",
        auto_backup_enabled: "true",
      })
      
      // Recovery point tracking
      await client.hset("recovery:points", {
        total_recovery_points: "0",
        last_recovery_time: "",
        last_recovery_success: "false",
      })
      
      // Snapshots for critical data
      await client.sadd("snapshots:trades", "")
      await client.sadd("snapshots:positions", "")
      await client.sadd("snapshots:connections", "")
      await client.sadd("snapshots:strategies", "")
      
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
      await client.hset("settings:system", {
        trade_engine_enabled: "true",
        auto_migration: "true",
        fallback_mode: "memory",
        theme: "dark",
        timezone: "UTC",
        language: "en",
      })
      
      // Trading settings
      await client.hset("settings:trading", {
        default_leverage: "1",
        max_leverage: "20",
        default_take_profit_percent: "2",
        default_stop_loss_percent: "1",
        max_position_size: "100000",
      })
      
      // API settings
      await client.hset("settings:api", {
        api_version: "v1",
        rate_limit_enabled: "true",
        cors_enabled: "true",
        request_timeout_seconds: "30",
      })
      
      // Migration and deployment metadata
      await client.set("_migration_last_run", new Date().toISOString())
      await client.set("_migration_total_runs", "0")
      
      // Feature flags
      await client.hset("features:enabled", {
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
      
      // Define enabled exchanges that should be active for trade engine startup
      const enabledExchanges = ["bybit", "bingx", "pionex", "orangex"]
      
      // Directly embed all predefined connections with correct enabled/active states
      const connections = [
        {
          id: "bybit-x03",
          name: "Bybit X03",
          exchange: "bybit",
          api_type: "unified",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("bybit"),
          is_active: enabledExchanges.includes("bybit"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "bingx-x01",
          name: "BingX X01",
          exchange: "bingx",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("bingx"),
          is_active: enabledExchanges.includes("bingx"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "binance-x01",
          name: "Binance X01",
          exchange: "binance",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("binance"),
          is_active: enabledExchanges.includes("binance"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "okx-x01",
          name: "OKX X01",
          exchange: "okx",
          api_type: "unified",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("okx"),
          is_active: enabledExchanges.includes("okx"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "gateio-x01",
          name: "Gate.io X01",
          exchange: "gateio",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("gateio"),
          is_active: enabledExchanges.includes("gateio"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "kucoin-x01",
          name: "KuCoin X01",
          exchange: "kucoin",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("kucoin"),
          is_active: enabledExchanges.includes("kucoin"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "mexc-x01",
          name: "MEXC X01",
          exchange: "mexc",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("mexc"),
          is_active: enabledExchanges.includes("mexc"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "bitget-x01",
          name: "Bitget X01",
          exchange: "bitget",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("bitget"),
          is_active: enabledExchanges.includes("bitget"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pionex-x01",
          name: "Pionex X01",
          exchange: "pionex",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("pionex"),
          is_active: enabledExchanges.includes("pionex"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "orangex-x01",
          name: "OrangeX X01",
          exchange: "orangex",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("orangex"),
          is_active: enabledExchanges.includes("orangex"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "huobi-x01",
          name: "Huobi X01",
          exchange: "huobi",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: enabledExchanges.includes("huobi"),
          is_active: enabledExchanges.includes("huobi"),
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]

      let seededCount = 0
      
      for (const conn of connections) {
        try {
          const key = `connection:${conn.id}`
          const existing = await client.hgetall(key)
          
          if (!existing || Object.keys(existing).length === 0) {
            // Convert boolean values to "1"/"0" for Redis storage
            const storageData = {
              id: conn.id,
              name: conn.name,
              exchange: conn.exchange,
              api_key: conn.api_key,
              api_secret: conn.api_secret,
              api_type: conn.api_type,
              connection_method: conn.connection_method,
              connection_library: conn.connection_library,
              margin_type: conn.margin_type,
              position_mode: conn.position_mode,
              is_testnet: conn.is_testnet ? "1" : "0",
              is_enabled: conn.is_enabled ? "1" : "0",
              is_active: conn.is_active ? "1" : "0",
              is_predefined: "1",
              created_at: conn.created_at,
              updated_at: conn.updated_at,
            }
            
            // Store connection in Redis
            await client.hset(key, storageData)
            // Add to connections set
            await client.sadd("connections", conn.id)
            console.log(`[v0] [Seed] Seeded connection: ${conn.name} (enabled: ${conn.is_enabled}, active: ${conn.is_active})`)
            seededCount++
          }
        } catch (error) {
          console.warn(`[v0] [Seed] Failed to seed connection ${conn.name}:`, error instanceof Error ? error.message : "unknown")
        }
      }
      
      console.log(`[v0] [Seed] Migration 011: Seeded ${seededCount}/${connections.length} predefined connections`)
    },
    down: async (client: any) => {
      await client.set("_schema_version", "10")
    },
  },
        {
          id: "bingx-x01",
          name: "BingX X01",
          exchange: "bingx",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: true,
          is_active: true,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "binance-x01",
          name: "Binance X01",
          exchange: "binance",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: false,
          is_active: false,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "okx-x01",
          name: "OKX X01",
          exchange: "okx",
          api_type: "unified",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: false,
          is_active: false,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "gateio-x01",
          name: "Gate.io X01",
          exchange: "gateio",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: false,
          is_active: false,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "kucoin-x01",
          name: "KuCoin X01",
          exchange: "kucoin",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: false,
          is_active: false,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "mexc-x01",
          name: "MEXC X01",
          exchange: "mexc",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: false,
          is_active: false,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "bitget-x01",
          name: "Bitget X01",
          exchange: "bitget",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: false,
          is_active: false,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pionex-x01",
          name: "Pionex X01",
          exchange: "pionex",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: true,
          is_active: true,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "orangex-x01",
          name: "OrangeX X01",
          exchange: "orangex",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: true,
          is_active: true,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "huobi-x01",
          name: "Huobi X01",
          exchange: "huobi",
          api_type: "perpetual_futures",
          connection_method: "library",
          connection_library: "native",
          api_key: "00998877009988770099887700998877",
          api_secret: "00998877009988770099887700998877",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: false,
          is_active: false,
          is_predefined: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]

      let seededCount = 0
      
      for (const conn of connections) {
        try {
          const key = `connection:${conn.id}`
          const existing = await client.hgetall(key)
          
          if (!existing || Object.keys(existing).length === 0) {
            // Store connection in Redis
            await client.hset(key, conn)
            // Add to connections set
            await client.sadd("connections", conn.id)
            console.log(`[v0] [Seed] Seeded connection: ${conn.name} (enabled: ${conn.is_enabled}, active: ${conn.is_active})`)
            seededCount++
          }
        } catch (error) {
          console.warn(`[v0] [Seed] Failed to seed connection ${conn.name}:`, error instanceof Error ? error.message : "unknown")
        }
      }
      
      console.log(`[v0] [Seed] Migration 011: Seeded ${seededCount}/${connections.length} predefined connections`)
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
