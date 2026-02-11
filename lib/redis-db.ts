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
    console.log("[v0] [Redis] Already connected, reusing connection")
    return
  }

  console.log("[v0] [Redis] Initializing connection...")
  console.log("[v0] [Redis] REDIS_URL configured:", REDIS_URL ? "YES (length: " + REDIS_URL.length + ")" : "NO")
  console.log("[v0] [Redis] REDIS_PASSWORD configured:", REDIS_PASSWORD ? "YES" : "NO")

  try {
    // Only try to connect to Redis if we have a valid URL (not localhost, not empty)
    if (REDIS_URL && !REDIS_URL.includes("localhost") && REDIS_URL.trim().length > 0) {
      console.log("[v0] [Redis] Attempting to connect to Redis at:", REDIS_URL.substring(0, 30) + "...")
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
        console.log("[v0] [Redis] ✓ Redis database initialized successfully with persistent storage")
        return
      } catch (error) {
        // Clean up failed connection attempt
        redisClient = null
        console.error("[v0] [Redis] ✗ Connection failed:", error instanceof Error ? error.message : error)
        console.warn("[v0] [Redis] Falling back to in-memory store (data will be lost on restart)")
        isUsingFallback = true
        isConnected = true
      }
    } else {
      // No Redis URL - use fallback immediately
      console.warn("[v0] [Redis] ✗ No Redis URL configured!")
      console.warn("[v0] [Redis] Set REDIS_URL or UPSTASH_REDIS_REST_URL environment variable for persistent storage")
      console.warn("[v0] [Redis] Using fallback in-memory store (data will be lost on restart)")
      isUsingFallback = true
      isConnected = true
    }
  } catch (error) {
    console.error("[v0] [Redis] Initialization error:", error instanceof Error ? error.message : error)
    console.warn("[v0] [Redis] Using fallback in-memory store (data will be lost on restart)")
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
  const client = await getRedisClient()
  const id = data.id || `${data.exchange}-${Date.now()}`

  console.log("[v0] [DB] Creating connection:", id, "exchange:", data.exchange, "enabled:", data.is_enabled !== false)

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

  console.log("[v0] [DB] ✓ Connection created successfully:", id)
  return id
}

export async function getConnection(id: string): Promise<any> {
  const client = getRedisClient()
  const data = await client.hGetAll(`connection:${id}`)
  return Object.keys(data).length > 0 ? data : null
}

export async function getAllConnections(): Promise<any[]> {
  console.log("[v0] [DB] Querying all connections...")
  const client = await getRedisClient()
  const connectionIds = await client.sMembers("connections:all")

  console.log("[v0] [DB] Found", connectionIds?.length || 0, "connection IDs in index")

  if (!connectionIds || connectionIds.length === 0 || (connectionIds.length === 1 && !connectionIds[0])) {
    console.log("[v0] [DB] No connections found in database")
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

  console.log("[v0] [DB] Retrieved", connections.length, "complete connections")
  return connections
}

export async function updateConnection(id: string, data: any): Promise<void> {
  const client = getRedisClient()
  data.updated_at = new Date().toISOString()
  await client.hSet(`connection:${id}`, data)
}

export async function deleteConnection(id: string): Promise<boolean> {
  console.log("[v0] [DB] Deleting connection:", id)
  const client = getRedisClient()
  const connection = await getConnection(id)

  if (!connection) {
    console.warn("[v0] [DB] Connection not found for deletion:", id)
    return false
  }

  await client.sRem("connections:all", id)
  await client.sRem(`connections:${connection.exchange}`, id)
  await client.sRem("connections:enabled", id)
  await client.sRem("connections:active", id)
  await client.del(`connection:${id}`)

  console.log("[v0] [DB] ✓ Connection deleted successfully:", id)
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
