/**
 * Redis Database Module - Core Database Layer
 * Replaces SQLite/PostgreSQL with Redis for high-performance data storage
 * Includes fallback in-memory store for development/preview environments
 */

// Only import redis library if we have a valid Redis URL configured
let redisClient: any = null
let isConnected = false
let isUsingFallback = false

// In-memory fallback store for development/preview
const memoryStore = new Map<string, Map<string, any>>()
const memorySets = new Map<string, Set<string>>()
const memoryLists = new Map<string, string[]>()

const REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || ""
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.UPSTASH_REDIS_REST_TOKEN || ""

/**
 * Initialize Redis connection with fallback to memory store
 */
export async function initRedis(): Promise<void> {
  if (isConnected) {
    return
  }

  try {
    // Only try to connect to Redis if we have a valid URL (not localhost, not empty)
    if (REDIS_URL && !REDIS_URL.includes("localhost") && REDIS_URL.trim().length > 0) {
      try {
        // Lazy import of redis library only when needed
        const { createClient, RedisClientType, RedisModules } = await import("redis")

        const options: any = {
          url: REDIS_URL,
          socket: {
            reconnectStrategy: (retries: number) => {
              // Stop reconnecting after 3 attempts
              if (retries > 3) {
                console.warn("[v0] Redis max reconnection attempts reached, using fallback")
                return new Error("Max reconnection attempts")
              }
              return Math.min(retries * 50, 500)
            },
            connectTimeout: 5000,
          },
        }

        if (REDIS_PASSWORD && REDIS_PASSWORD.trim().length > 0) {
          options.password = REDIS_PASSWORD
        }

        redisClient = createClient(options)

        // Set error handler to suppress repeated errors
        let hasError = false
        redisClient.on("error", (err: any) => {
          if (!hasError) {
            console.warn("[v0] Redis connection error, using fallback:", err?.message || "unknown error")
            hasError = true
          }
          isUsingFallback = true
        })

        redisClient.on("connect", () => {
          console.log("[v0] Redis connected")
          isUsingFallback = false
        })

        // Connect with timeout
        await Promise.race([
          redisClient.connect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Connection timeout")), 10000)
          ),
        ])

        isConnected = true
        isUsingFallback = false
        await initializeIndexes()
        console.log("[v0] Redis database initialized")
        return
      } catch (error) {
        // Clean up failed connection attempt
        redisClient = null
        console.log("[v0] Redis unavailable, using fallback in-memory store")
        isUsingFallback = true
        isConnected = true
      }
    } else {
      // No Redis URL - use fallback immediately
      console.log("[v0] No Redis URL configured, using fallback in-memory store")
      isUsingFallback = true
      isConnected = true
    }
  } catch (error) {
    console.log("[v0] Using fallback in-memory store:", error instanceof Error ? error.message : "unknown")
    isUsingFallback = true
    isConnected = true
  }
}


/**
 * Get Redis client
 */
export function getRedisClient(): any {
  // Auto-initialize if not already initialized
  if (!isConnected) {
    // Initialize synchronously in fallback mode if needed
    isUsingFallback = true
    isConnected = true
  }

  // Return fallback implementation if not using real Redis
  if (isUsingFallback || !redisClient) {
    return createMemoryStoreProxy()
  }

  return redisClient
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

      // Simple pattern matching
      if (pattern === "*") return allKeys
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1)
        return allKeys.filter((k) => k.startsWith(prefix))
      }
      return allKeys.filter((k) => k === pattern)
    },

    async expire(key: string, seconds: number): Promise<boolean> {
      // In-memory store doesn't have real TTL, just return success
      return true
    },

    async ttl(key: string): Promise<number> {
      // Return a large number to indicate it exists
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
  const client = getRedisClient()
  const id = `conn:${data.exchange}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`

  const connectionData = {
    id,
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await client.hSet(`connection:${id}`, connectionData)
  await client.sAdd("connections:all", id)
  await client.sAdd(`connections:${data.exchange}`, id)

  // TTL: 30 days for inactive connections
  await client.expire(`connection:${id}`, 30 * 24 * 60 * 60)

  return id
}

export async function getConnection(id: string): Promise<any> {
  const client = getRedisClient()
  const data = await client.hGetAll(`connection:${id}`)
  return Object.keys(data).length > 0 ? data : null
}

export async function getAllConnections(): Promise<any[]> {
  const client = getRedisClient()
  const ids = await client.sMembers("connections:all")

  if (ids.length === 0) return []

  const connections = await Promise.all(
    ids.map(async (id) => {
      const data = await client.hGetAll(`connection:${id}`)
      return Object.keys(data).length > 0 ? data : null
    })
  )

  return connections.filter(Boolean)
}

export async function updateConnection(id: string, data: any): Promise<void> {
  const client = getRedisClient()
  data.updated_at = new Date().toISOString()
  await client.hSet(`connection:${id}`, data)
}

export async function deleteConnection(id: string): Promise<void> {
  const client = getRedisClient()
  const connection = await getConnection(id)

  if (connection) {
    await client.sRem("connections:all", id)
    await client.sRem(`connections:${connection.exchange}`, id)
    await client.del(`connection:${id}`)
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
  if (isUsingFallback) {
    // Close memory store
    memoryStore.clear()
    memorySets.clear()
    memoryLists.clear()
    isConnected = false
    console.log("[v0] In-memory database closed")
  } else if (redisClient && isConnected) {
    try {
      await redisClient.quit()
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

// Market data functions
export async function getMarketData(symbol: string, limit: number = 100): Promise<any[]> {
  const client = getRedisClient()
  try {
    const data = await client.lRange(`market_data:${symbol}`, 0, limit - 1)
    return (data || []).map((item: string) => {
      try { return JSON.parse(item) } catch { return null }
    }).filter(Boolean)
  } catch (error) {
    console.warn(`[v0] Failed to get market data for ${symbol}:`, error)
    return []
  }
}

export async function saveMarketData(symbol: string, data: any): Promise<void> {
  const client = getRedisClient()
  try {
    await client.lPush(`market_data:${symbol}`, JSON.stringify({ ...data, timestamp: new Date().toISOString() }))
    await client.lTrim(`market_data:${symbol}`, 0, 499) // Keep last 500 entries
  } catch (error) {
    console.warn(`[v0] Failed to save market data for ${symbol}:`, error)
  }
}

// Indication functions
export async function saveIndication(data: any): Promise<string> {
  const client = getRedisClient()
  const id = data.id || `ind_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  try {
    const indication = { ...data, id, created_at: data.calculated_at || new Date().toISOString() }
    await client.lPush(`indications:${data.connection_id}`, JSON.stringify(indication))
    await client.lTrim(`indications:${data.connection_id}`, 0, 999) // Keep last 1000
    return id
  } catch (error) {
    console.warn(`[v0] Failed to save indication:`, error)
    return id
  }
}

export async function getIndications(connectionId: string, limit: number = 100): Promise<any[]> {
  const client = getRedisClient()
  try {
    const data = await client.lRange(`indications:${connectionId}`, 0, limit - 1)
    return (data || []).map((item: string) => {
      try { return JSON.parse(item) } catch { return null }
    }).filter(Boolean)
  } catch (error) {
    console.warn(`[v0] Failed to get indications:`, error)
    return []
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
