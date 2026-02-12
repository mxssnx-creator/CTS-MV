import { Redis } from "@upstash/redis"

/**
 * Redis Database Module - Using Upstash Redis
 * Production database layer with full persistence
 */

let redisClient: Redis | null = null
let isConnected = false

/**
 * Initialize Upstash Redis connection
 */
export async function initRedis(): Promise<void> {
  if (isConnected && redisClient) {
    return
  }

  try {
    // Try Vercel KV variables first, then fallback to Upstash-specific variables
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      throw new Error(
        "Redis credentials not configured. Check KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN environment variables."
      )
    }

    redisClient = new Redis({
      url,
      token,
    })

    // Test connection
    const ping = await redisClient.ping()
    if (ping === "PONG") {
      isConnected = true
      console.log("[v0] [Redis] Connected to Upstash Redis successfully")
    } else {
      throw new Error("Redis ping failed")
    }
  } catch (error) {
    console.error("[v0] [Redis] Failed to initialize Upstash Redis:", error)
    redisClient = null
    isConnected = false
    throw error
  }
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error("Redis client not initialized. Call initRedis() first.")
  }
  return redisClient
}

/**
 * Verify Redis connection and health
 */
export async function verifyRedisHealth(): Promise<boolean> {
  try {
    await initRedis()
    const client = getRedisClient()
    const ping = await client.ping()
    console.log("[v0] [Redis] Health check passed")
    return ping === "PONG"
  } catch (error) {
    console.error("[v0] [Redis] Health check failed:", error)
    return false
  }
}

/**
 * Initialize Redis indexes for optimized queries
 */
async function initializeIndexes(): Promise<void> {
  try {
    console.log("[v0] Redis indexes configured (Upstash manages indexes)")
  } catch (error) {
    console.warn("[v0] Index configuration skipped:", error)
  }
}

/**
 * Connection data operations - with comprehensive error handling
 */
export async function createConnection(data: any): Promise<string> {
  try {
    await initRedis()
    const client = getRedisClient()
    const id = data.id || `${data.exchange}-${Date.now()}`

    const connectionData = {
      ...data,
      id,
      is_enabled: String(data.is_enabled !== false),
      is_active: String(data.is_active !== false),
      is_testnet: String(data.is_testnet === true),
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await client.hSet(`connection:${id}`, connectionData)
    await client.sAdd("connections:all", id)
    await client.sAdd(`connections:${data.exchange}`, id)

    if (data.is_enabled) {
      await client.sAdd("connections:enabled", id)
    }

    if (data.is_active) {
      await client.sAdd("connections:active", id)
    }

    console.log("[v0] [DB] Connection created:", id)
    return id
  } catch (error) {
    console.error("[v0] [DB] Failed to create connection:", error)
    throw error
  }
}

export async function getConnection(id: string): Promise<any> {
  try {
    await initRedis()
    const client = getRedisClient()
    const data = await client.hGetAll(`connection:${id}`)
    if (Object.keys(data).length > 0) {
      return {
        id,
        ...data,
        is_enabled: data.is_enabled === "true" || data.is_enabled === true,
        is_active: data.is_active === "true" || data.is_active === true,
        is_testnet: data.is_testnet === "true" || data.is_testnet === true,
      }
    }
    return null
  } catch (error) {
    console.error("[v0] [DB] Failed to get connection:", error)
    return null
  }
}

export async function getAllConnections(): Promise<any[]> {
  try {
    await initRedis()
    const client = getRedisClient()
    const connectionIds = await client.sMembers("connections:all")

    if (!connectionIds || connectionIds.length === 0) {
      return []
    }

    const connections = []
    for (const id of connectionIds) {
      if (!id) continue
      const data = await client.hGetAll(`connection:${id}`)
      if (data && Object.keys(data).length > 0) {
        connections.push({
          id,
          ...data,
          is_enabled: data.is_enabled === "true" || data.is_enabled === true || data.is_enabled === 1,
          is_active: data.is_active === "true" || data.is_active === true || data.is_active === 1,
          is_testnet: data.is_testnet === "true" || data.is_testnet === true || data.is_testnet === 1,
          connection_settings: typeof data.connection_settings === "string" ? JSON.parse(data.connection_settings || "{}") : data.connection_settings || {},
        })
      }
    }

    console.log("[v0] [DB] Retrieved", connections.length, "connections")
    return connections
  } catch (error) {
    console.error("[v0] [DB] Failed to get all connections:", error)
    return []
  }
}

export async function updateConnection(id: string, data: any): Promise<void> {
  try {
    await initRedis()
    const client = getRedisClient()
    data.updated_at = new Date().toISOString()
    await client.hSet(`connection:${id}`, data)
    console.log("[v0] [DB] Connection updated:", id)
  } catch (error) {
    console.error("[v0] [DB] Failed to update connection:", error)
    throw error
  }
}

export async function deleteConnection(id: string): Promise<boolean> {
  try {
    await initRedis()
    const client = getRedisClient()
    const connection = await getConnection(id)

    if (!connection) {
      return false
    }

    await client.sRem("connections:all", id)
    await client.sRem(`connections:${connection.exchange}`, id)
    await client.sRem("connections:enabled", id)
    await client.sRem("connections:active", id)
    await client.del(`connection:${id}`)
    
    // Clean up related data
    await client.del(`trades:${id}`)
    await client.del(`positions:${id}`)
    await client.del(`trade_engine_state:${id}`)

    console.log("[v0] [DB] Connection deleted:", id)
    return true
  } catch (error) {
    console.error("[v0] [DB] Failed to delete connection:", error)
    throw error
  }
}

/**
 * Trade data operations
 */
export async function createTrade(connectionId: string, data: any): Promise<string> {
  const client = getRedisClient()
  const id = `trade:${connectionId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`

  const tradeData = {
    id,
    connection_id: connectionId,
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await client.hSet(`trade:${id}`, tradeData)
  await client.sAdd(`trades:${connectionId}`, id)
  await client.sAdd("trades:all", id)

  // TTL: 90 days for trades
  await client.expire(`trade:${id}`, 90 * 24 * 60 * 60)

  return id
}

export async function getTrade(id: string): Promise<any> {
  const client = getRedisClient()
  const data = await client.hGetAll(`trade:${id}`)
  return Object.keys(data).length > 0 ? data : null
}

export async function getConnectionTrades(connectionId: string): Promise<any[]> {
  const client = getRedisClient()
  const ids = await client.sMembers(`trades:${connectionId}`)

  const trades = await Promise.all(
    ids.map(async (id) => {
      const data = await client.hGetAll(`trade:${id}`)
      return Object.keys(data).length > 0 ? data : null
    })
  )

  return trades.filter(Boolean)
}

export async function updateTrade(id: string, data: any): Promise<void> {
  const client = getRedisClient()
  data.updated_at = new Date().toISOString()
  await client.hSet(`trade:${id}`, data)
}

/**
 * Position data operations
 */
export async function createPosition(connectionId: string, data: any): Promise<string> {
  const client = getRedisClient()
  const id = `pos:${connectionId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`

  const positionData = {
    id,
    connection_id: connectionId,
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await client.hSet(`position:${id}`, positionData)
  await client.sAdd(`positions:${connectionId}`, id)
  await client.sAdd(`positions:${data.symbol}`, id)
  await client.sAdd("positions:all", id)

  return id
}

export async function getPosition(id: string): Promise<any> {
  const client = getRedisClient()
  const data = await client.hGetAll(`position:${id}`)
  return Object.keys(data).length > 0 ? data : null
}

export async function getConnectionPositions(connectionId: string): Promise<any[]> {
  const client = getRedisClient()
  const ids = await client.sMembers(`positions:${connectionId}`)

  const positions = await Promise.all(
    ids.map(async (id) => {
      const data = await client.hGetAll(`position:${id}`)
      return Object.keys(data).length > 0 ? data : null
    })
  )

  return positions.filter(Boolean)
}

export async function updatePosition(id: string, data: any): Promise<void> {
  const client = getRedisClient()
  data.updated_at = new Date().toISOString()
  await client.hSet(`position:${id}`, data)
}

export async function deletePosition(id: string): Promise<void> {
  const client = getRedisClient()
  const position = await getPosition(id)

  if (position) {
    await client.sRem("positions:all", id)
    await client.sRem(`positions:${position.connection_id}`, id)
    await client.sRem(`positions:${position.symbol}`, id)
    await client.del(`position:${id}`)
  }
}

/**
 * Settings/Configuration operations
 */
export async function setSettings(key: string, value: any): Promise<void> {
  const client = getRedisClient()
  await client.set(`settings:${key}`, JSON.stringify(value))
}

export async function getSettings(key: string): Promise<any> {
  const client = getRedisClient()
  const data = await client.get(`settings:${key}`)
  return data ? JSON.parse(data) : null
}

export async function deleteSettings(key: string): Promise<void> {
  const client = getRedisClient()
  await client.del(`settings:${key}`)
}

/**
 * Bulk operations
 */
export async function flushAll(): Promise<void> {
  const client = getRedisClient()
  await client.flushDb()
  console.log("[v0] Redis database flushed")
}

/**
 * Connection pooling and utilities
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    isConnected = false
    redisClient = null
    console.log("[v0] Redis connection closed")
  }
}

export async function isRedisConnected(): Promise<boolean> {
  return isConnected && redisClient !== null
}

export async function getRedisStats(): Promise<any> {
  try {
    await initRedis()
    const client = getRedisClient()
    const dbSize = await client.dbSize()

    return {
      connected: isConnected,
      provider: "Upstash Redis",
      keyCount: dbSize || 0,
      mode: "persistent",
    }
  } catch (error) {
    console.error("[v0] Error getting Redis stats:", error)
    return {
      connected: false,
      provider: "Upstash Redis",
      keyCount: 0,
      error: String(error),
    }
  }
}

/**
 * Market Data operations
 */
export async function getMarketData(symbol: string, limit: number = 100): Promise<any[]> {
  const client = getRedisClient()
  const ids = await client.lRange(`marketdata:${symbol}`, 0, limit - 1)
  
  const data = await Promise.all(
    ids.map(async (id) => {
      const item = await client.hGetAll(`marketdata:item:${id}`)
      return Object.keys(item).length > 0 ? item : null
    })
  )
  
  return data.filter(Boolean)
}

export async function saveMarketData(symbol: string, data: any): Promise<void> {
  const client = getRedisClient()
  const id = `${symbol}:${Date.now()}`
  
  await client.hSet(`marketdata:item:${id}`, {
    ...data,
    symbol,
    timestamp: new Date().toISOString(),
  })
  
  await client.lPush(`marketdata:${symbol}`, id)
  await client.lTrim(`marketdata:${symbol}`, 0, 999) // Keep last 1000 entries
  await client.expire(`marketdata:item:${id}`, 7 * 24 * 60 * 60) // 7 days TTL
}

/**
 * Indication operations
 */
export async function saveIndication(data: any): Promise<string> {
  const client = getRedisClient()
  const id = `ind:${data.connection_id}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
  
  const indicationData = {
    id,
    ...data,
    created_at: new Date().toISOString(),
  }
  
  await client.hSet(`indication:${id}`, indicationData)
  await client.sAdd(`indications:${data.connection_id}`, id)
  await client.sAdd(`indications:${data.symbol}`, id)
  await client.sAdd("indications:all", id)
  
  // TTL: 7 days
  await client.expire(`indication:${id}`, 7 * 24 * 60 * 60)
  
  return id
}

export async function getIndications(connectionId: string, symbol?: string): Promise<any[]> {
  const client = getRedisClient()
  const key = symbol ? `indications:${symbol}` : `indications:${connectionId}`
  const ids = await client.sMembers(key)
  
  const indications = await Promise.all(
    ids.map(async (id) => {
      const data = await client.hGetAll(`indication:${id}`)
      return Object.keys(data).length > 0 ? data : null
    })
  )
  
  return indications.filter(Boolean)
}

/**
 * Export helper function wrapper for compatibility
 */
export async function getRedisHelpers() {
  const helpers = await import("./db-helpers")
  return helpers.getRedisHelpers()
}
