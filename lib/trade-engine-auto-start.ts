/**
 * Trade Engine Auto-Start Service
 * Automatically starts trade engines for enabled connections via their toggles
 */

import { getGlobalTradeEngineCoordinator } from "./trade-engine"
import { getAllConnections, getRedisClient, initRedis } from "./redis-db"
import { loadSettingsAsync } from "./settings-storage"

let autoStartInitialized = false
let autoStartTimer: NodeJS.Timeout | null = null

export function isAutoStartInitialized(): boolean {
  return autoStartInitialized
}

/**
 * Initialize and start trade engines automatically
 */
export async function initializeTradeEngineAutoStart(): Promise<void> {
  if (autoStartInitialized) {
    console.log("[v0] [Auto-Start] Already initialized, skipping")
    return
  }

  try {
    console.log("[v0] [Auto-Start] Starting trade engine auto-initialization...")
    const coordinator = getGlobalTradeEngineCoordinator()
    
    // Check if Global Trade Engine Coordinator is running
    await initRedis()
    const client = getRedisClient()
    const globalState = await client.hgetall("trade_engine:global")
    const globalRunning = globalState?.status === "running"
    
    if (!globalRunning) {
      console.log("[v0] [Auto-Start] Global Trade Engine is not running - skipping auto-start. Engines will resume when global is started.")
      autoStartInitialized = true
      startConnectionMonitoring()
      return
    }
    
    const connections = await getAllConnections()

    console.log("[v0] [Auto-Start] Retrieved", connections?.length || 0, "connections from database")

    // Ensure connections is an array
    if (!Array.isArray(connections)) {
      console.error("[v0] [Auto-Start] ERROR: connections is not an array", typeof connections)
      autoStartInitialized = true
      return
    }

    // Filter for connections that are INSERTED (user-configured) AND ENABLED
    // Predefined connections are just templates and must NOT be auto-started
    const enabledConnections = connections.filter((c) => {
      const isInserted = c.is_inserted === true || c.is_inserted === "true" || c.is_inserted === "1"
      const isEnabled = c.is_enabled === true || c.is_enabled === "true" || c.is_enabled === "1"
      const hasValidKey = c.api_key && c.api_key.length >= 20 && !c.api_key.includes("PLACEHOLDER")
      return isInserted && isEnabled && hasValidKey
    })

    console.log(`[v0] [Auto-Start] Found ${enabledConnections.length} eligible connections (inserted + enabled + valid keys) out of ${connections.length} total`)

    if (enabledConnections.length === 0) {
      console.log("[v0] [Auto-Start] No enabled connections - monitoring for changes...")
      autoStartInitialized = true
      startConnectionMonitoring()
      return
    }

    const settings = await loadSettingsAsync()
    const indicationInterval = settings.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 1
    const strategyInterval = settings.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 1
    const realtimeInterval = settings.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 0.2

    let successCount = 0

    for (const connection of enabledConnections) {
      try {
        await coordinator.startEngine(connection.id, {
          connectionId: connection.id,
          indicationInterval,
          strategyInterval,
          realtimeInterval,
        })
        successCount++
        console.log(`[v0] [Auto-Start] ✓ Started trade engine for ${connection.name}`)
      } catch (error) {
        console.error(`[v0] [Auto-Start] ✗ Failed to start ${connection.name}:`, error)
      }
    }

    console.log(`[v0] [Auto-Start] ✓ Trade engines started: ${successCount}/${enabledConnections.length}`)
    autoStartInitialized = true
    startConnectionMonitoring()
  } catch (error) {
    console.error("[v0] [Auto-Start] Initialization failed:", error)
    autoStartInitialized = true
  }
}

/**
 * Monitor for connection changes and auto-start new engines
 */
function startConnectionMonitoring(): void {
  let lastEnabledCount = 0
  let cachedSettings: any = null
  let settingsCacheTime = 0
  const SETTINGS_CACHE_TTL = 60000 // 60 seconds

  autoStartTimer = setInterval(async () => {
    try {
      // Always check global engine status first
      await initRedis()
      const monClient = getRedisClient()
      const monGlobalState = await monClient.hgetall("trade_engine:global")
      if (monGlobalState?.status !== "running") {
        // Global engine not running - don't auto-start any connections
        return
      }
      
      const connections = await getAllConnections()

      // Ensure connections is an array before filtering
      if (!Array.isArray(connections)) {
        console.warn("[v0] [Monitor] Connections not array")
        return
      }

      // Filter for INSERTED + ENABLED + valid API keys only
      const enabledConnections = connections.filter((c) => {
        const isInserted = c.is_inserted === true || c.is_inserted === "true" || c.is_inserted === "1"
        const isEnabled = c.is_enabled === true || c.is_enabled === "true" || c.is_enabled === "1"
        const hasValidKey = c.api_key && c.api_key.length >= 20 && !c.api_key.includes("PLACEHOLDER")
        return isInserted && isEnabled && hasValidKey
      })

      // If enabled connection count changed, log it
      if (enabledConnections.length !== lastEnabledCount) {
        console.log(`[v0] [Monitor] Enabled connections changed: ${lastEnabledCount} -> ${enabledConnections.length}`)
        lastEnabledCount = enabledConnections.length
      }

      // Load settings ONCE per interval, not per connection
      let settings = cachedSettings
      if (!settings || Date.now() - settingsCacheTime > SETTINGS_CACHE_TTL) {
        settings = await loadSettingsAsync()
        cachedSettings = settings
        settingsCacheTime = Date.now()
      }

      const coordinator = getGlobalTradeEngineCoordinator()

      for (const connection of enabledConnections) {
        try {
          // Check if engine is already running for this connection
          const engineStatus = coordinator.getEngineStatus(connection.id)

          if (!engineStatus || engineStatus.status === "stopped") {
            console.log(`[v0] [Monitor] Auto-starting trade engine for: ${connection.name}`)

            if (connection.api_key && connection.api_secret) {
              await coordinator.startEngine(connection.id, {
                connectionId: connection.id,
                indicationInterval: settings.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 1,
                strategyInterval: settings.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 1,
                realtimeInterval: settings.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 0.2,
              })

              console.log(`[v0] [Monitor] ✓ Trade engine auto-started: ${connection.name}`)
            }
          }
        } catch (error) {
          console.warn(`[v0] [Monitor] Failed to auto-start ${connection.name}:`, error)
        }
      }
    } catch (error) {
      // Log but don't crash - gracefully handle Redis errors
      if (error instanceof Error && error.message.includes("Redis credentials")) {
        // Only log once per interval to avoid spam
        if (Math.random() < 0.1) {
          console.warn("[v0] [Monitor] Redis not configured - skipping auto-start check")
        }
      } else {
        console.warn("[v0] [Monitor] Error during connection monitoring:", error instanceof Error ? error.message : String(error))
      }
    }
  }, 10000) // Check every 10 seconds for new enabled connections
}

/**
 * Stop the connection monitoring timer
 */
export function stopConnectionMonitoring(): void {
  if (autoStartTimer) {
    clearInterval(autoStartTimer)
    autoStartTimer = null
  }
}
