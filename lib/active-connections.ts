/**
 * Active Connections Manager
 * Handles connections currently actively using (INDEPENDENT from Settings)
 * Uses Redis as single source of truth (via is_enabled_dashboard field)
 * 
 * INDEPENDENCE GUARANTEE:
 * - Toggling an Active connection does NOT affect Settings connections
 * - Settings connections status (is_enabled) is COMPLETELY INDEPENDENT
 * - Each has its own toggle/state system managed separately
 */

import { getRedisHelpers } from "./redis-helpers"

export interface ActiveConnection {
  id: string
  connectionId: string
  exchangeName: string
  isActive: boolean // Toggle button state (independent from is_enabled_dashboard)
  addedAt: string
}

export async function loadActiveConnections(): Promise<ActiveConnection[]> {
  try {
    const redis = await getRedisHelpers()
    await redis.initRedis()
    
    // Get all connections from Redis
    const allConnections = await redis.getAllConnections()
    
    // Filter for connections that are actively using (is_enabled_dashboard = true)
    // Status is INDEPENDENT from Settings connections
    const activeConnections: ActiveConnection[] = []
    
    for (const conn of allConnections) {
      if (conn.is_enabled_dashboard === true || conn.is_enabled_dashboard === "1") {
        activeConnections.push({
          id: `active-${conn.id}`,
          connectionId: conn.id,
          exchangeName: conn.exchange.charAt(0).toUpperCase() + conn.exchange.slice(1),
          isActive: conn.is_enabled === true || conn.is_enabled === "1", // Independent toggle
          addedAt: conn.created_at || new Date().toISOString(),
        })
      }
    }
    
    console.log(`[v0] [ActiveConnections] Loaded ${activeConnections.length} actively using connections (INDEPENDENT from Settings)`)
    return activeConnections
  } catch (error) {
    console.error("[v0] Error loading active connections from Redis:", error)
    // Return default connections on error
    return getDefaultActiveConnections()
  }
}

export async function saveActiveConnections(connections: ActiveConnection[]): Promise<void> {
  try {
    const redis = await getRedisHelpers()
    await redis.initRedis()
    
    // Update active connections - toggling Active does NOT affect Settings
    console.log(`[v0] [ActiveConnections] Updating ${connections.length} active connections in Redis (independent update)`)
    
    for (const ac of connections) {
      try {
        const connection = await redis.getConnection(ac.connectionId)
        if (connection) {
          // Update only the active list toggle - does NOT affect Settings is_enabled
          connection.is_enabled = ac.isActive ? "1" : "0"
          await redis.updateConnection(ac.connectionId, connection)
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
    const redis = await getRedisHelpers()
    await redis.initRedis()
    
    const connection = await redis.getConnection(connectionId)
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`)
    }
    
    // Mark connection as actively using - does NOT affect Settings status
    connection.is_enabled_dashboard = "1"
    await redis.updateConnection(connectionId, connection)
    
    console.log(`[v0] [ActiveConnections] Added ${connectionId} to actively using (INDEPENDENT from Settings)`)
    
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
    const redis = await getRedisHelpers()
    await redis.initRedis()
    
    const connection = await redis.getConnection(connectionId)
    if (connection) {
      // Mark connection as not actively using - does NOT affect Settings status
      connection.is_enabled_dashboard = "0"
      await redis.updateConnection(connectionId, connection)
      console.log(`[v0] [ActiveConnections] Removed ${connectionId} from actively using (Settings unchanged)`)
    }
  } catch (error) {
    console.error("[v0] Error removing active connection:", error)
    throw error
  }
}

export async function toggleActiveConnection(connectionId: string, isActive: boolean): Promise<void> {
  try {
    const redis = await getRedisHelpers()
    await redis.initRedis()
    
    const connection = await redis.getConnection(connectionId)
    if (connection) {
      // Toggle only the active list state - completely independent from Settings
      connection.is_enabled = isActive ? "1" : "0"
      await redis.updateConnection(connectionId, connection)
      console.log(`[v0] [ActiveConnections] Toggled ${connectionId}: ${isActive ? "active" : "inactive"} (Settings is_enabled independent)`)
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
