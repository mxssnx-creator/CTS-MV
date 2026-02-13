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
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN

    if (!url || !token) {
      throw new Error(
        "Redis credentials not configured. Please set KV_REST_API_URL and KV_REST_API_TOKEN via Vercel KV integration."
      )
    }

    redisClient = new Redis({ url, token })

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

// ========== Connection CRUD ==========

export async function saveConnection(connection: any): Promise<void> {
  const client = getRedisClient()
  const key = `connection:${connection.id}`
  
  await client.hset(key, {
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
  
  await client.sadd("connections", connection.id)
}

export async function getConnection(connectionId: string): Promise<any> {
  const client = getRedisClient()
  const key = `connection:${connectionId}`
  const data = await client.hgetall(key)
  
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

export async function getAllConnections(): Promise<any[]> {
  const client = getRedisClient()
  
  try {
    const connectionIds = await client.smembers("connections")
    
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

export async function updateConnection(connectionId: string, updates: any): Promise<void> {
  const connection = await getConnection(connectionId)
  
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`)
  }

  const updated = { ...connection, ...updates, updated_at: new Date().toISOString() }
  await saveConnection(updated)
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const client = getRedisClient()
  const key = `connection:${connectionId}`
  
  await client.del(key)
  await client.srem("connections", connectionId)
}

export async function getEnabledConnections(): Promise<any[]> {
  const connections = await getAllConnections()
  return connections.filter(conn => conn.is_enabled === true)
}

// ========== Trade CRUD ==========

export async function createTrade(connectionId: string, trade: any): Promise<any> {
  const client = getRedisClient()
  const key = `trade:${trade.id}`
  const setKey = `trades:${connectionId}`

  const tradeData: Record<string, string> = {}
  for (const [k, v] of Object.entries(trade)) {
    tradeData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }

  await client.hset(key, tradeData)
  await client.sadd(setKey, trade.id)
  return trade
}

export async function getTrade(tradeId: string): Promise<any> {
  const client = getRedisClient()
  const key = `trade:${tradeId}`
  const data = await client.hgetall(key)
  if (!data || Object.keys(data).length === 0) return null
  return data
}

export async function getConnectionTrades(connectionId: string): Promise<any[]> {
  const client = getRedisClient()
  const setKey = `trades:${connectionId}`
  const tradeIds = await client.smembers(setKey)
  if (!tradeIds || tradeIds.length === 0) return []

  const trades = []
  for (const tradeId of tradeIds) {
    const trade = await getTrade(tradeId)
    if (trade) trades.push(trade)
  }
  return trades
}

export async function updateTrade(tradeId: string, updates: any): Promise<any> {
  const existing = await getTrade(tradeId)
  if (!existing) throw new Error(`Trade ${tradeId} not found`)

  const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
  const client = getRedisClient()
  const key = `trade:${tradeId}`
  
  const tradeData: Record<string, string> = {}
  for (const [k, v] of Object.entries(updated)) {
    tradeData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hset(key, tradeData)
  return updated
}

// ========== Position CRUD ==========

export async function createPosition(connectionId: string, position: any): Promise<any> {
  const client = getRedisClient()
  const key = `position:${position.id}`
  const setKey = `positions:${connectionId}`

  const posData: Record<string, string> = {}
  for (const [k, v] of Object.entries(position)) {
    posData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }

  await client.hset(key, posData)
  await client.sadd(setKey, position.id)
  return position
}

export async function getPosition(positionId: string): Promise<any> {
  const client = getRedisClient()
  const key = `position:${positionId}`
  const data = await client.hgetall(key)
  if (!data || Object.keys(data).length === 0) return null
  return data
}

export async function getConnectionPositions(connectionId: string): Promise<any[]> {
  const client = getRedisClient()
  const setKey = `positions:${connectionId}`
  const positionIds = await client.smembers(setKey)
  if (!positionIds || positionIds.length === 0) return []

  const positions = []
  for (const positionId of positionIds) {
    const pos = await getPosition(positionId)
    if (pos) positions.push(pos)
  }
  return positions
}

export async function updatePosition(positionId: string, updates: any): Promise<any> {
  const existing = await getPosition(positionId)
  if (!existing) throw new Error(`Position ${positionId} not found`)

  const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
  const client = getRedisClient()
  const key = `position:${positionId}`
  
  const posData: Record<string, string> = {}
  for (const [k, v] of Object.entries(updated)) {
    posData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hset(key, posData)
  return updated
}

export async function deletePosition(connectionId: string, positionId: string): Promise<void> {
  const client = getRedisClient()
  const key = `position:${positionId}`
  const setKey = `positions:${connectionId}`

  await client.del(key)
  await client.srem(setKey, positionId)
}

// ========== Indications ==========

export async function saveIndication(connectionId: string, indication: any): Promise<void> {
  const client = getRedisClient()
  const key = `indication:${indication.id}`
  const setKey = `indications:${connectionId}`
  
  const indicationData: Record<string, string> = {}
  for (const [k, v] of Object.entries(indication)) {
    indicationData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  
  await client.hset(key, indicationData)
  await client.sadd(setKey, indication.id)
}

export async function getIndications(connectionId: string): Promise<any[]> {
  const client = getRedisClient()
  const setKey = `indications:${connectionId}`
  const indicationIds = await client.smembers(setKey)
  if (!indicationIds || indicationIds.length === 0) return []
  
  const indications = []
  for (const indicationId of indicationIds) {
    const key = `indication:${indicationId}`
    const indication = await client.hgetall(key)
    if (indication && Object.keys(indication).length > 0) {
      indications.push(indication)
    }
  }
  return indications
}

// ========== Market Data ==========

export async function saveMarketData(symbol: string, data: any): Promise<void> {
  const client = getRedisClient()
  const key = `market_data:${symbol}`
  
  const marketData: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    marketData[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  
  await client.hset(key, marketData)
  await client.expire(key, 300)
}

export async function getMarketData(symbol: string): Promise<any> {
  const client = getRedisClient()
  const key = `market_data:${symbol}`
  const data = await client.hgetall(key)
  if (!data || Object.keys(data).length === 0) return null
  return data
}

// ========== Settings ==========

export async function setSettings(key: string, value: any): Promise<void> {
  const client = getRedisClient()
  await client.set(`settings:${key}`, JSON.stringify(value))
}

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

export async function deleteSettings(key: string): Promise<void> {
  const client = getRedisClient()
  await client.del(`settings:${key}`)
}

// ========== Utilities ==========

export async function flushAll(): Promise<void> {
  const client = getRedisClient()
  await client.flushdb()
}

export async function closeRedis(): Promise<void> {
  redisClient = null
  isConnected = false
}

export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null
}

export async function getRedisStats(): Promise<any> {
  if (!isConnected || !redisClient) {
    return { connected: false }
  }
  try {
    const dbSize = await redisClient.dbsize()
    return {
      connected: true,
      dbSize,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return { connected: false, error: String(error) }
  }
}

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

// Backward compatibility aliases
export const saveTrade = createTrade
export const savePosition = createPosition
export const getTradesForConnection = getConnectionTrades
export const getPositionsForConnection = getConnectionPositions
export const createConnection = saveConnection
