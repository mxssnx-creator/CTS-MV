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
  if (!redisClient || !isConnected) {
    throw new Error("Redis not initialized. Call initRedis() first.")
  }
  return redisClient
}

/**
 * Store a connection in Redis
 */
export async function saveConnection(connection: any): Promise<void> {
  const client = getRedisClient()
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
    api_passphrase: connection.api_passphrase || "",
    created_at: connection.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  
  // Add to connections set
  await client.sAdd("connections", connection.id)
}

/**
 * Get a specific connection
 */
export async function getConnection(connectionId: string): Promise<any> {
  const client = getRedisClient()
  const key = `connection:${connectionId}`
  const data = await client.hGetAll(key)
  
  if (!data || Object.keys(data).length === 0) {
    return null
  }

  return {
    id: data.id,
    name: data.name,
    exchange: data.exchange,
    api_key: data.api_key || "",
    api_secret: data.api_secret || "",
    api_type: data.api_type || "spot",
    connection_method: data.connection_method || "rest",
    connection_library: data.connection_library || "ccxt",
    margin_type: data.margin_type || "isolated",
    position_mode: data.position_mode || "one-way",
    is_testnet: data.is_testnet === "1",
    is_enabled: data.is_enabled === "1",
    is_active: data.is_active === "1",
    api_passphrase: data.api_passphrase || "",
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}

/**
 * Update a connection
 */
export async function updateConnection(connectionId: string, updates: any): Promise<void> {
  const client = getRedisClient()
  const connection = await getConnection(connectionId)
  
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`)
  }

  const updated = { ...connection, ...updates }
  await saveConnection(updated)
}

/**
 * Get all connections
 */
export async function getAllConnections(): Promise<any[]> {
  const client = getRedisClient()
  
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
 * Delete a connection
 */
export async function deleteConnection(connectionId: string): Promise<void> {
  const client = getRedisClient()
  const key = `connection:${connectionId}`
  
  await client.del(key)
  await client.sRem("connections", connectionId)
}

/**
 * Get all enabled connections
 */
export async function getEnabledConnections(): Promise<any[]> {
  const connections = await getAllConnections()
  return connections.filter(conn => conn.is_enabled === true || conn.is_enabled === "true")
}

// ========== Connection CRUD ==========

/**
 * Create a new connection (alias for saveConnection)
 */
export async function createConnection(connection: any): Promise<any> {
  await saveConnection(connection)
  return connection
}

// ========== Trade CRUD ==========

/**
 * Create a trade
 */
export async function createTrade(connectionId: string, trade: any): Promise<any> {
  const client = getRedisClient()
  const key = `trade:${trade.id}`
  const setKey = `trades:${connectionId}`

  const tradeData: Record<string, string> = {}
  for (const [k, v] of Object.entries(trade)) {
    tradeData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }

  await client.hSet(key, tradeData)
  await client.sAdd(setKey, trade.id)
  return trade
}

/**
 * Get a trade
 */
export async function getTrade(tradeId: string): Promise<any> {
  const client = getRedisClient()
  const key = `trade:${tradeId}`
  const data = await client.hGetAll(key)
  if (!data || Object.keys(data).length === 0) return null
  return data
}

/**
 * Get all trades for a connection
 */
export async function getConnectionTrades(connectionId: string): Promise<any[]> {
  const client = getRedisClient()
  const setKey = `trades:${connectionId}`
  const tradeIds = await client.sMembers(setKey)
  if (!tradeIds || tradeIds.length === 0) return []

  const trades = []
  for (const tradeId of tradeIds) {
    const trade = await getTrade(tradeId)
    if (trade) trades.push(trade)
  }
  return trades
}

/**
 * Update a trade
 */
export async function updateTrade(tradeId: string, updates: any): Promise<any> {
  const client = getRedisClient()
  const key = `trade:${tradeId}`
  const existing = await getTrade(tradeId)
  if (!existing) throw new Error(`Trade ${tradeId} not found`)

  const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
  const tradeData: Record<string, string> = {}
  for (const [k, v] of Object.entries(updated)) {
    tradeData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hSet(key, tradeData)
  return updated
}

// ========== Position CRUD ==========

/**
 * Create a position
 */
export async function createPosition(connectionId: string, position: any): Promise<any> {
  const client = getRedisClient()
  const key = `position:${position.id}`
  const setKey = `positions:${connectionId}`

  const posData: Record<string, string> = {}
  for (const [k, v] of Object.entries(position)) {
    posData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }

  await client.hSet(key, posData)
  await client.sAdd(setKey, position.id)
  return position
}

/**
 * Get a position
 */
export async function getPosition(positionId: string): Promise<any> {
  const client = getRedisClient()
  const key = `position:${positionId}`
  const data = await client.hGetAll(key)
  if (!data || Object.keys(data).length === 0) return null
  return data
}

/**
 * Get all positions for a connection
 */
export async function getConnectionPositions(connectionId: string): Promise<any[]> {
  const client = getRedisClient()
  const setKey = `positions:${connectionId}`
  const positionIds = await client.sMembers(setKey)
  if (!positionIds || positionIds.length === 0) return []

  const positions = []
  for (const positionId of positionIds) {
    const pos = await getPosition(positionId)
    if (pos) positions.push(pos)
  }
  return positions
}

/**
 * Update a position
 */
export async function updatePosition(positionId: string, updates: any): Promise<any> {
  const client = getRedisClient()
  const key = `position:${positionId}`
  const existing = await getPosition(positionId)
  if (!existing) throw new Error(`Position ${positionId} not found`)

  const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
  const posData: Record<string, string> = {}
  for (const [k, v] of Object.entries(updated)) {
    posData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hSet(key, posData)
  return updated
}

/**
 * Delete a position
 */
export async function deletePosition(connectionId: string, positionId: string): Promise<void> {
  const client = getRedisClient()
  const key = `position:${positionId}`
  const setKey = `positions:${connectionId}`

  await client.del(key)
  await client.sRem(setKey, positionId)
}

// ========== Settings ==========

/**
 * Set a settings value
 */
export async function setSettings(key: string, value: any): Promise<void> {
  const client = getRedisClient()
  await client.set(`settings:${key}`, JSON.stringify(value))
}

/**
 * Get a settings value
 */
export async function getSettings(key: string): Promise<any> {
  const client = getRedisClient()
  const value = await client.get(`settings:${key}`)
  if (value === null || value === undefined) return null
  try {
    return typeof value === "string" ? JSON.parse(value) : value
  } catch {
    return value
  }
}

/**
 * Delete a settings value
 */
export async function deleteSettings(key: string): Promise<void> {
  const client = getRedisClient()
  await client.del(`settings:${key}`)
}

// ========== Utilities ==========

/**
 * Flush all data from Redis
 */
export async function flushAll(): Promise<void> {
  const client = getRedisClient()
  await client.flushAll()
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  redisClient = null
  isConnected = false
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null
}

/**
 * Get Redis stats
 */
export async function getRedisStats(): Promise<any> {
  if (!isConnected || !redisClient) {
    return { connected: false }
  }
  try {
    const dbSize = await redisClient.dbSize()
    return {
      connected: true,
      dbSize,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return { connected: false, error: String(error) }
  }
}

/**
 * Verify Redis health
 */
export async function verifyRedisHealth(): Promise<boolean> {
  try {
    if (!redisClient) {
      await initRedis()
    }
    const ping = await redisClient!.ping()
    return ping === "PONG"
  } catch {
    return false
  }
}

// ========== Aliases for backward compat ==========

export const saveTrade = createTrade
export const savePosition = createPosition
export const getTradesForConnection = getConnectionTrades
export const getPositionsForConnection = getConnectionPositions
