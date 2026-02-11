/**
 * Redis Database Module - Core Database Layer
 * Uses Upstash Redis (REST-based) for persistent storage
 * Includes fallback in-memory store for development/preview environments
 */

import { Redis } from "@upstash/redis"

let redisClient: Redis | null = null
let isConnected = false
let isUsingFallback = false

// In-memory fallback store for development/preview
const memoryStore = new Map<string, Map<string, any>>()
const memorySets = new Map<string, Set<string>>()
const memoryLists = new Map<string, string[]>()

/**
 * Initialize Upstash Redis connection with fallback to memory store
 */
export async function initRedis(): Promise<void> {
  if (isConnected) {
    return
  }

  const restUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ""
  const restToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""

  console.log("[v0] [Redis] Initializing Upstash Redis connection...")
  console.log("[v0] [Redis] KV_REST_API_URL configured:", restUrl ? "YES" : "NO")
  console.log("[v0] [Redis] KV_REST_API_TOKEN configured:", restToken ? "YES" : "NO")

  try {
    if (restUrl && restToken) {
      console.log("[v0] [Redis] Connecting to Upstash Redis...")
      
      redisClient = new Redis({
        url: restUrl,
        token: restToken,
      })

      // Test connection with a ping
      const pong = await redisClient.ping()
      if (pong === "PONG") {
        isConnected = true
        isUsingFallback = false
        console.log("[v0] [Redis] ✓ Upstash Redis connected successfully (persistent storage)")
        return
      } else {
        throw new Error("Unexpected ping response: " + pong)
      }
    } else {
      console.warn("[v0] [Redis] No Upstash Redis credentials configured")
      console.warn("[v0] [Redis] Set KV_REST_API_URL and KV_REST_API_TOKEN for persistent storage")
      console.warn("[v0] [Redis] Using fallback in-memory store (data will be lost on restart)")
      isUsingFallback = true
      isConnected = true
    }
  } catch (error) {
    console.error("[v0] [Redis] Connection failed:", error instanceof Error ? error.message : error)
    console.warn("[v0] [Redis] Falling back to in-memory store")
    redisClient = null
    isUsingFallback = true
    isConnected = true
  }
}


/**
 * Get Redis client - returns a unified interface that works with both
 * Upstash Redis and the in-memory fallback store
 */
export function getRedisClient(): any {
  if (!isConnected) {
    isUsingFallback = true
    isConnected = true
  }

  if (isUsingFallback || !redisClient) {
    return createMemoryStoreProxy()
  }

  // Wrap Upstash Redis client in a compatibility layer
  // Upstash uses lowercase methods and slightly different signatures
  return createUpstashProxy(redisClient)
}

/**
 * Wrap Upstash Redis client to normalize the API for the rest of the codebase.
 * The codebase uses node-redis style (hSet, hGetAll, sAdd etc.)
 * Upstash uses (hset, hgetall, sadd etc.) but the @upstash/redis SDK
 * actually exposes them in the same casing, just with different arg handling.
 */
function createUpstashProxy(client: Redis): any {
  return {
    async hSet(key: string, ...args: any[]): Promise<number> {
      let obj: Record<string, string> = {}
      if (args.length === 1 && typeof args[0] === "object") {
        obj = args[0]
      } else {
        for (let i = 0; i < args.length; i += 2) {
          obj[String(args[i])] = String(args[i + 1])
        }
      }
      // Upstash hset accepts (key, obj)
      const result = await client.hset(key, obj)
      return typeof result === "number" ? result : Object.keys(obj).length
    },

    async hGetAll(key: string): Promise<Record<string, string>> {
      const result = await client.hgetall(key)
      if (!result || Object.keys(result).length === 0) return {}
      // Upstash returns values as their original types, normalize to strings
      const normalized: Record<string, string> = {}
      for (const [k, v] of Object.entries(result)) {
        normalized[k] = String(v)
      }
      return normalized
    },

    async hGet(key: string, field: string): Promise<string | null> {
      const result = await client.hget(key, field)
      return result !== null && result !== undefined ? String(result) : null
    },

    async sAdd(key: string, ...members: string[]): Promise<number> {
      const result = await client.sadd(key, ...members)
      return typeof result === "number" ? result : members.length
    },

    async sMembers(key: string): Promise<string[]> {
      const result = await client.smembers(key)
      return (result || []).map(String)
    },

    async sRem(key: string, ...members: string[]): Promise<number> {
      const result = await client.srem(key, ...members)
      return typeof result === "number" ? result : 0
    },

    async lPush(key: string, ...values: string[]): Promise<number> {
      const result = await client.lpush(key, ...values)
      return typeof result === "number" ? result : values.length
    },

    async lRange(key: string, start: number, end: number): Promise<string[]> {
      const result = await client.lrange(key, start, end)
      return (result || []).map(String)
    },

    async lTrim(key: string, start: number, end: number): Promise<string> {
      await client.ltrim(key, start, end)
      return "OK"
    },

    async del(...keys: string[]): Promise<number> {
      if (keys.length === 0) return 0
      const result = await client.del(...keys)
      return typeof result === "number" ? result : keys.length
    },

    async keys(pattern: string): Promise<string[]> {
      // Upstash supports SCAN-based key listing
      const allKeys: string[] = []
      let cursor = 0
      do {
        const [nextCursor, keys] = await client.scan(cursor, { match: pattern, count: 100 })
        allKeys.push(...keys.map(String))
        cursor = nextCursor
      } while (cursor !== 0)
      return allKeys
    },

    async expire(key: string, seconds: number): Promise<boolean> {
      const result = await client.expire(key, seconds)
      return !!result
    },

    async ttl(key: string): Promise<number> {
      return await client.ttl(key)
    },

    async set(key: string, value: string): Promise<string> {
      await client.set(key, value)
      return "OK"
    },

    async get(key: string): Promise<string | null> {
      const result = await client.get(key)
      return result !== null && result !== undefined ? String(result) : null
    },

    async flushDb(): Promise<string> {
      await client.flushdb()
      return "OK"
    },

    async ping(): Promise<string> {
      return await client.ping()
    },

    async info(): Promise<string> {
      return "Upstash Redis - Persistent Storage"
    },

    async dbSize(): Promise<number> {
      return await client.dbsize()
    },

    async quit(): Promise<void> {
      // Upstash REST client doesn't need explicit disconnect
    },
  }
}

/**
 * Create a proxy object that mimics Redis client interface using memory store
 */
function createMemoryStoreProxy(): any {
  return {
    async hSet(key: string, ...args: any[]): Promise<number> {
      if (!memoryStore.has(key)) {
        memoryStore.set(key, new Map())
      }
      const hash = memoryStore.get(key)!

      if (args.length === 1 && typeof args[0] === "object") {
        Object.entries(args[0]).forEach(([k, v]) => {
          hash.set(k, String(v))
        })
        return Object.keys(args[0]).length
      }

      for (let i = 0; i < args.length; i += 2) {
        hash.set(String(args[i]), String(args[i + 1]))
      }
      return args.length / 2
    },

    async hGetAll(key: string): Promise<Record<string, string>> {
      const hash = memoryStore.get(key)
      if (!hash) return {}
      const obj: Record<string, string> = {}
      hash.forEach((v, k) => {
        obj[k] = v
      })
      return obj
    },

    async hGet(key: string, field: string): Promise<string | null> {
      const hash = memoryStore.get(key)
      return hash?.get(field) ?? null
    },

    async sAdd(key: string, ...members: string[]): Promise<number> {
      if (!memorySets.has(key)) {
        memorySets.set(key, new Set())
      }
      const set = memorySets.get(key)!
      const before = set.size
      members.forEach((m) => set.add(m))
      return set.size - before
    },

    async sMembers(key: string): Promise<string[]> {
      const set = memorySets.get(key)
      return set ? Array.from(set) : []
    },

    async sRem(key: string, ...members: string[]): Promise<number> {
      const set = memorySets.get(key)
      if (!set) return 0
      let removed = 0
      members.forEach((m) => {
        if (set.has(m)) {
          set.delete(m)
          removed++
        }
      })
      return removed
    },

    async lPush(key: string, ...values: string[]): Promise<number> {
      if (!memoryLists.has(key)) {
        memoryLists.set(key, [])
      }
      const list = memoryLists.get(key)!
      list.unshift(...values)
      return list.length
    },

    async lRange(key: string, start: number, end: number): Promise<string[]> {
      const list = memoryLists.get(key)
      if (!list) return []
      return list.slice(start, end + 1)
    },

    async lTrim(key: string, start: number, end: number): Promise<string> {
      const list = memoryLists.get(key)
      if (!list) return "OK"
      const trimmed = list.slice(start, end + 1)
      memoryLists.set(key, trimmed)
      return "OK"
    },

    async del(...keys: string[]): Promise<number> {
      let deleted = 0
      keys.forEach((k) => {
        if (memoryStore.has(k) || memorySets.has(k) || memoryLists.has(k)) {
          memoryStore.delete(k)
          memorySets.delete(k)
          memoryLists.delete(k)
          deleted++
        }
      })
      return deleted
    },

    async keys(pattern: string): Promise<string[]> {
      const allKeys = [
        ...Array.from(memoryStore.keys()),
        ...Array.from(memorySets.keys()),
        ...Array.from(memoryLists.keys()),
      ]
      if (pattern === "*") return allKeys
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1)
        return allKeys.filter((k) => k.startsWith(prefix))
      }
      return allKeys.filter((k) => k === pattern)
    },

    async expire(key: string, seconds: number): Promise<boolean> {
      return true
    },

    async ttl(key: string): Promise<number> {
      return memoryStore.has(key) || memorySets.has(key) || memoryLists.has(key) ? 86400 : -2
    },

    async set(key: string, value: string): Promise<string> {
      if (!memoryStore.has(key)) {
        memoryStore.set(key, new Map())
      }
      const hash = memoryStore.get(key)!
      hash.set("__value__", value)
      return "OK"
    },

    async get(key: string): Promise<string | null> {
      const hash = memoryStore.get(key)
      return hash?.get("__value__") ?? null
    },

    async flushDb(): Promise<string> {
      memoryStore.clear()
      memorySets.clear()
      memoryLists.clear()
      return "OK"
    },

    async ping(): Promise<string> {
      return "PONG"
    },

    async info(): Promise<string> {
      return "Memory Store - Fallback Mode"
    },

    async dbSize(): Promise<number> {
      return memoryStore.size + memorySets.size + memoryLists.size
    },

    async quit(): Promise<void> {
      memoryStore.clear()
      memorySets.clear()
      memoryLists.clear()
    },
  }
}

/**
 * Initialize Redis indexes for optimized queries
 */
async function initializeIndexes(): Promise<void> {
  if (!redisClient && !isUsingFallback) return

  try {
    console.log("[v0] Database indexes configured")
  } catch (error) {
    console.warn("[v0] Index initialization skipped:", error)
  }
}

/**
 * Connection data operations
 */
export async function createConnection(data: any): Promise<string> {
  const client = await getRedisClient()
  const id = data.id || `${data.exchange}-${Date.now()}`

  const connectionData = {
    ...data,
    id,
    is_enabled: String(data.is_enabled !== false),
    is_active: String(data.is_active !== false), // Active if passed as active
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

  return id
}

export async function getConnection(id: string): Promise<any> {
  const client = getRedisClient()
  const data = await client.hGetAll(`connection:${id}`)
  return Object.keys(data).length > 0 ? data : null
}

export async function getAllConnections(): Promise<any[]> {
  const client = await getRedisClient()
  const connectionIds = await client.sMembers("connections:all")

  if (!connectionIds || connectionIds.length === 0 || (connectionIds.length === 1 && !connectionIds[0])) {
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
        is_enabled: data.is_enabled === "true",
        is_active: data.is_active === "true",
        is_testnet: data.is_testnet === "true",
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
      })
    }
  }

  return connections
}

export async function updateConnection(id: string, data: any): Promise<void> {
  const client = getRedisClient()
  data.updated_at = new Date().toISOString()
  await client.hSet(`connection:${id}`, data)
}

export async function deleteConnection(id: string): Promise<boolean> {
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

  return true
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
  if (isUsingFallback) {
  memoryStore.clear()
  memorySets.clear()
  memoryLists.clear()
  isConnected = false
  console.log("[v0] In-memory database closed")
  } else if (redisClient && isConnected) {
  try {
  // Upstash REST client doesn't need explicit disconnect
    } catch (error) {
      console.warn("[v0] Error closing Redis:", error)
    }
    redisClient = null
    isConnected = false
    console.log("[v0] Redis connection closed")
  }
}

export async function isRedisConnected(): Promise<boolean> {
  if (isUsingFallback) {
    return isConnected
  }

  if (!redisClient) return false
  try {
    await redisClient.ping()
    return true
  } catch {
    return false
  }
}

export async function getRedisStats(): Promise<any> {
  const client = getRedisClient()

  try {
    const keyCount = await client.dbSize()

    if (isUsingFallback) {
      return {
        connected: isConnected,
        isUsingFallback: true,
        keyCount,
        hashCount: memoryStore.size,
        setCount: memorySets.size,
        listCount: memoryLists.size,
        mode: "in-memory-fallback",
      }
    }

    const info = await client.info()
    return {
      connected: isConnected,
      isUsingFallback: false,
      keyCount,
      info,
      mode: "redis",
    }
  } catch (error) {
    console.error("[v0] Error getting Redis stats:", error)
    return {
      connected: false,
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
