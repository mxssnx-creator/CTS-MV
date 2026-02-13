import { Redis } from "@upstash/redis"

/**
 * Redis database client and operations
 * Uses Vercel KV integration (KV_REST_API_URL and KV_REST_API_TOKEN)
 */

let redisClient: Redis | null = null
let isConnected = false

/**
 * Initialize Upstash Redis connection using Vercel KV variables
 */
export async function initRedis(): Promise<void> {
  if (isConnected && redisClient) {
    return
  }

  try {
    // Use Vercel KV environment variables (standard for Vercel integrations)
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN

    if (!url || !token) {
      throw new Error(
        "Redis credentials not configured. Please set KV_REST_API_URL and KV_REST_API_TOKEN via Vercel KV integration."
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
      console.log("[v0] [Redis] Connected successfully")
    } else {
      throw new Error("Redis ping failed")
    }
  } catch (error) {
    console.error("[v0] [Redis] Failed to initialize:", error instanceof Error ? error.message : String(error))
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
    throw new Error("Redis not initialized. Call initRedis() first.")
  }
  return redisClient
}

/**
 * Ensure Redis is initialized before operations
 */
async function ensureRedis(): Promise<Redis> {
  if (!redisClient || !isConnected) {
    await initRedis()
  }
  return redisClient!
}

/**
 * Store a connection in Redis
 */
export async function saveConnection(connection: any): Promise<void> {
  const client = await ensureRedis()
  const key = `connection:${connection.id}`
  
  await client.hSet(key, {
    id: connection.id,
    name: connection.name,
    exchange: connection.exchange,
    api_key: connection.api_key || "",
    api_secret: connection.api_secret || "",
    api_type: connection.api_type || "spot",
    connection_method: connection.connection_method || "rest",
    connection_library: connection.connection_library || "ccxt",
    margin_type: connection.margin_type || "isolated",
    position_mode: connection.position_mode || "one-way",
    is_testnet: connection.is_testnet ? "1" : "0",
    is_enabled: connection.is_enabled ? "1" : "0",
    is_active: connection.is_active ? "1" : "0",
    created_at: connection.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  
  // Add to connections index
  await client.sAdd("connections", connection.id)
}

/**
 * Get a connection from Redis
 */
export async function getConnection(connectionId: string): Promise<any> {
  const client = await ensureRedis()
  const key = `connection:${connectionId}`
  const data = await client.hGetAll(key)
  
  if (!data || Object.keys(data).length === 0) {
    return null
  }
  
  return {
    ...data,
    is_testnet: data.is_testnet === "1",
    is_enabled: data.is_enabled === "1",
    is_active: data.is_active === "1",
  }
}

/**
 * Get all connections from Redis
 */
export async function getAllConnections(): Promise<any[]> {
  const client = await ensureRedis()
  
  try {
    const connectionIds = await client.sMembers("connections")
    
    if (!connectionIds || connectionIds.length === 0) {
      return []
    }
    
    const connections = []
    for (const id of connectionIds) {
      const conn = await getConnection(id)
      if (conn) {
        connections.push(conn)
      }
    }
    
    return connections
  } catch (error) {
    console.error("[v0] [DB] Failed to get all connections:", error)
    throw error
  }
}

/**
 * Update a connection in Redis
 */
export async function updateConnection(connectionId: string, updates: any): Promise<void> {
  const client = await ensureRedis()
  const existing = await getConnection(connectionId)
  
  if (!existing) {
    throw new Error(`Connection ${connectionId} not found`)
  }
  
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  }
  
  await saveConnection(updated)
}

/**
 * Delete a connection from Redis
 */
export async function deleteConnection(connectionId: string): Promise<void> {
  const client = await ensureRedis()
  const key = `connection:${connectionId}`
  
  await client.del(key)
  await client.sRem("connections", connectionId)
}
  return redisClient
}
// ========== Indications ==========

/**
 * Save an indication
 */
export async function saveIndication(connectionId: string, indication: any): Promise<void> {
  const client = await ensureRedis()
  const key = `indication:${indication.id}`
  const setKey = `indications:${connectionId}`
  
  const indicationData: Record<string, string> = {}
  for (const [k, v] of Object.entries(indication)) {
    indicationData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  
  await client.hSet(key, indicationData)
  await client.sAdd(setKey, indication.id)
}

/**
 * Get all indications for a connection
 */
export async function getIndications(connectionId: string): Promise<any[]> {
  const client = await ensureRedis()
  const setKey = `indications:${connectionId}`
  const indicationIds = await client.sMembers(setKey)
  if (!indicationIds || indicationIds.length === 0) return []
  
  const indications = []
  for (const indicationId of indicationIds) {
    const key = `indication:${indicationId}`
    const indication = await client.hGetAll(key)
    if (indication && Object.keys(indication).length > 0) {
      indications.push(indication)
    }
  }
  return indications
}

// ========== Market Data ==========

/**
 * Save market data for a symbol
 */
export async function saveMarketData(symbol: string, data: any): Promise<void> {
  const client = await ensureRedis()
  const key = `market_data:${symbol}`
  
  const marketData: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    marketData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  
  await client.hSet(key, marketData)
  await client.expire(key, 300) // 5 minutes TTL
}

/**
 * Get market data for a symbol
 */
export async function getMarketData(symbol: string): Promise<any> {
  const client = await ensureRedis()
  const key = `market_data:${symbol}`
  const data = await client.hGetAll(key)
  if (!data || Object.keys(data).length === 0) return null
  return data
}

// ========== Aliases for backward compat ==========

export const saveTrade = createTrade
export const savePosition = createPosition
export const getTradesForConnection = getConnectionTrades
export const getPositionsForConnection = getConnectionPositions
