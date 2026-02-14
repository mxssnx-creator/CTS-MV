/**
 * Active Connections Manager
 * Handles connections currently visible on the dashboard
 * Now uses Redis as single source of truth (via is_enabled_dashboard field)
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
    
    // Filter for connections that are visible on dashboard (is_enabled_dashboard = true)
    const activeConnections: ActiveConnection[] = []
    
    for (const conn of allConnections) {
      if (conn.is_enabled_dashboard === true || conn.is_enabled_dashboard === "1") {
        activeConnections.push({
          id: `active-${conn.id}`,
          connectionId: conn.id,
          exchangeName: conn.exchange.charAt(0).toUpperCase() + conn.exchange.slice(1),
          isActive: conn.is_enabled === true || conn.is_enabled === "1", // Button state matches is_enabled
          addedAt: conn.created_at || new Date().toISOString(),
        })
      }
    }
    
    console.log(`[v0] [ActiveConnections] Loaded ${activeConnections.length} active connections from Redis`)
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
    
    // This function is deprecated - active connections now stored via is_enabled_dashboard in connection records
    console.log(`[v0] [ActiveConnections] Updating ${connections.length} connections in Redis`)
    
    for (const ac of connections) {
      try {
        const connection = await redis.getConnection(ac.connectionId)
        if (connection) {
          // Update the connection's enabled state based on isActive
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
    
    // Mark connection as visible on dashboard
    connection.is_enabled_dashboard = "1"
    await redis.updateConnection(connectionId, connection)
    
    console.log(`[v0] [ActiveConnections] Added ${connectionId} to dashboard`)
    
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
      // Mark connection as not visible on dashboard
      connection.is_enabled_dashboard = "0"
      await redis.updateConnection(connectionId, connection)
      console.log(`[v0] [ActiveConnections] Removed ${connectionId} from dashboard`)
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
      // Toggle the enabled state
      connection.is_enabled = isActive ? "1" : "0"
      await redis.updateConnection(connectionId, connection)
      console.log(`[v0] [ActiveConnections] Toggled ${connectionId}: ${isActive ? "enabled" : "disabled"}`)
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
