/**
 * Trade Engine Auto-Start Service
 * Automatically starts trade engines for enabled/active connections
 */

import { getGlobalTradeEngineCoordinator } from "./trade-engine"
import { getAllConnections } from "./redis-db"
import { loadSettingsAsync } from "./settings-storage"
import { SystemLogger } from "./system-logger"

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
    const connections = await getAllConnections()

    console.log("[v0] [Auto-Start] Retrieved", connections?.length || 0, "connections from database")

    // Ensure connections is an array
    if (!Array.isArray(connections)) {
      console.error("[v0] [Auto-Start] ERROR: connections is not an array", typeof connections)
      autoStartInitialized = true
      return
    }

    // Log connection details for debugging
    connections.forEach(conn => {
      console.log(`[v0] [Auto-Start] Connection: ${conn.name} - enabled:${conn.is_enabled}, active:${conn.is_active}`)
    })

    const activeConnections = connections.filter((c) => c.is_enabled === true && c.is_active === true)

    console.log(`[v0] [Auto-Start] Found ${activeConnections.length} active connections out of ${connections.length} total`)

    if (activeConnections.length === 0) {
      console.log("[v0] Auto-start: No active connections to start, monitoring for changes...")
      autoStartInitialized = true
      startConnectionMonitoring()
      return
    }

    const settings = await loadSettingsAsync()
    const indicationInterval = settings.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 5
    const strategyInterval = settings.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 10
    const realtimeInterval = settings.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 3

    let successCount = 0

    for (const connection of activeConnections) {
      try {
        await coordinator.startEngine(connection.id, {
          connectionId: connection.id,
          indicationInterval,
          strategyInterval,
          realtimeInterval,
        })
        successCount++

        await SystemLogger.logTradeEngine(
          `Auto-started engine for ${connection.name}`,
          "info",
          { connectionId: connection.id }
        )
      } catch (error) {
        await SystemLogger.logError(error, "trade-engine", `Failed to start ${connection.name}`)
      }
    }

    console.log("[v0] Auto-start completed: started", successCount, "of", activeConnections.length, "engines")
    autoStartInitialized = true
    startConnectionMonitoring()
  } catch (error) {
    console.error("[v0] Auto-start initialization failed:", error)
    await SystemLogger.logError(error, "trade-engine", "Auto-start failed")
    autoStartInitialized = true
  }
}

/**
 * Monitor for connection changes and auto-start new engines
 */
function startConnectionMonitoring(): void {
  let lastConnectionCount = 0

  autoStartTimer = setInterval(async () => {
    try {
      const connections = await getAllConnections()

      // Ensure connections is an array before filtering
      if (!Array.isArray(connections)) {
        console.warn("[v0] Monitor: connections is not an array")
        return
      }

      const activeConnections = connections.filter((c) => c.is_enabled && c.is_active)

      if (activeConnections.length !== lastConnectionCount) {
        lastConnectionCount = activeConnections.length
      }

      const coordinator = getGlobalTradeEngineCoordinator()
      const settings = await loadSettingsAsync() || {}
      const indicationInterval = settings.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 5
      const strategyInterval = settings.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 10
      const realtimeInterval = settings.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 3

      for (const connection of activeConnections) {
        const manager = coordinator.getEngineManager(connection.id)
        if (!manager) {
          try {
            await coordinator.startEngine(connection.id, {
              connectionId: connection.id,
              indicationInterval,
              strategyInterval,
              realtimeInterval,
            })
          } catch (e) {
            console.warn("[v0] Monitor: failed to start new connection", connection.id, e)
          }
        }
      }
    } catch (error) {
      console.warn("[v0] Monitor error:", error)
    }
  }, 30000)
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
