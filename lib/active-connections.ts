/**
 * Active Connections Manager
 * Handles connections actively in use for trading (INDEPENDENT from Settings)
 * Uses Redis as single source of truth (via is_enabled_dashboard field)
 *
 * TERMINOLOGY:
 * - These are called "Active Connections" or "Actively Using" connections
 * - NOT called "Dashboard Connections" to avoid confusion
 *
 * INDEPENDENCE GUARANTEE:
 * - Toggling an Active connection does NOT affect Settings connections
 * - Settings connections status (is_enabled) is COMPLETELY INDEPENDENT
 * - Each has its own toggle/state system managed separately
 */

import { initRedis, getAllConnections, getConnection, updateConnection } from "@/lib/redis-db"

export interface ActiveConnection {
  id: string
  connectionId: string
  exchangeName: string
  isActive: boolean
  addedAt: string
}

export async function loadActiveConnections(): Promise<ActiveConnection[]> {
  try {
    await initRedis()
    const allConnections = await getAllConnections()

    const activeConnections: ActiveConnection[] = []

    for (const conn of allConnections) {
      if (conn.is_enabled_dashboard === true || conn.is_enabled_dashboard === "1") {
        activeConnections.push({
          id: `active-${conn.id}`,
          connectionId: conn.id,
          exchangeName: conn.exchange.charAt(0).toUpperCase() + conn.exchange.slice(1),
          isActive: conn.is_enabled === true || conn.is_enabled === "1",
          addedAt: conn.created_at || new Date().toISOString(),
        })
      }
    }

    return activeConnections
  } catch (error) {
    console.error("[v0] Error loading active connections from Redis:", error)
    return getDefaultActiveConnections()
  }
}

export async function saveActiveConnections(connections: ActiveConnection[]): Promise<void> {
  try {
    await initRedis()

    for (const ac of connections) {
      try {
        const connection = await getConnection(ac.connectionId)
        if (connection) {
          connection.is_enabled = ac.isActive ? "1" : "0"
          await updateConnection(ac.connectionId, connection)
        }
      } catch (e) {
        console.warn(`[v0] [ActiveConnections] Could not update ${ac.connectionId}:`, e)
      }
    }
  } catch (error) {
    console.error("[v0] Error saving active connections to Redis:", error)
  }
}

export async function addActiveConnection(connectionId: string, exchangeName: string): Promise<ActiveConnection> {
  try {
    await initRedis()

    // Retry mechanism - sometimes the connection set is empty momentarily
    let connection = null
    let retries = 0
    const maxRetries = 3
    
    while (!connection && retries < maxRetries) {
      connection = await getConnection(connectionId)
      if (!connection) {
        retries++
        console.log(`[v0] [ActiveConnections] Connection ${connectionId} not found, retry ${retries}/${maxRetries}`)
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
    }
    
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found after ${maxRetries} retries`)
    }

    connection.is_enabled_dashboard = "1"
    await updateConnection(connectionId, connection)

    return {
      id: `active-${connectionId}`,
      connectionId,
      exchangeName,
      isActive: connection.is_enabled === true || connection.is_enabled === "1",
      addedAt: connection.created_at || new Date().toISOString(),
    }
  } catch (error) {
    console.error("[v0] Error adding active connection:", error)
    throw error
  }
}

export async function removeActiveConnection(connectionId: string): Promise<void> {
  try {
    await initRedis()

    const connection = await getConnection(connectionId)
    if (connection) {
      connection.is_enabled_dashboard = "0"
      await updateConnection(connectionId, connection)
    }
  } catch (error) {
    console.error("[v0] Error removing active connection:", error)
    throw error
  }
}

export async function toggleActiveConnection(connectionId: string, isActive: boolean): Promise<void> {
  try {
    await initRedis()

    const connection = await getConnection(connectionId)
    if (connection) {
      connection.is_enabled = isActive ? "1" : "0"
      await updateConnection(connectionId, connection)
    }
  } catch (error) {
    console.error("[v0] Error toggling active connection:", error)
    throw error
  }
}

function getDefaultActiveConnections(): ActiveConnection[] {
  return [
    {
      id: "active-bybit",
      connectionId: "bybit-x03",
      exchangeName: "Bybit",
      isActive: false,
      addedAt: new Date().toISOString(),
    },
    {
      id: "active-bingx",
      connectionId: "bingx-x01",
      exchangeName: "BingX",
      isActive: false,
      addedAt: new Date().toISOString(),
    },
  ]
}
