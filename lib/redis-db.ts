/**
 * Redis database client and operations
 * Uses local in-memory Redis with file persistence
 * Data is automatically saved to .data/redis-snapshot.json and restored on startup
 * 
 * IMPORTANT: All exported functions are async to satisfy Turbopack's
 * Server Action requirement for files in the instrumentation import chain.
 */

import { RedisPersistenceManager } from "./redis-persistence"

// Inline the LocalRedis class to avoid cross-module sync export issues with Turbopack

export interface Connection {
  id: string
  name: string
  exchange: string
  api_key?: string
  api_secret?: string
  api_passphrase?: string
  api_type?: string
  api_subtype?: string
  connection_method?: string
  connection_library?: string
  margin_type?: string
  position_mode?: string
  is_testnet?: boolean | string
  is_enabled?: boolean | string
  is_enabled_dashboard?: boolean | string
  is_inserted?: boolean | string
  is_predefined?: boolean | string
  is_live_trade?: boolean | string
  is_preset_trade?: boolean | string
  last_test_status?: string
  last_test_time?: string
  last_test_message?: string
  created_at?: string
  updated_at?: string
  [key: string]: any
}

interface RedisDataValue {
  type: "string" | "hash" | "set"
  value: string | Record<string, string> | Set<string>
  expiresAt?: number
}

// Redis operations counter for tracking req/sec
const redisOpsTracker = {
  counts: [] as number[],     // timestamps of recent operations
  windowMs: 60000,            // 60 second sliding window
  
  record() {
    const now = Date.now()
    this.counts.push(now)
    // Keep only last 60 seconds of data
    const cutoff = now - this.windowMs
    while (this.counts.length > 0 && this.counts[0] < cutoff) {
      this.counts.shift()
    }
  },
  
  getRequestsPerSecond(): number {
    const now = Date.now()
    const cutoff = now - this.windowMs
    // Clean old entries
    while (this.counts.length > 0 && this.counts[0] < cutoff) {
      this.counts.shift()
    }
    // Calculate ops/sec over the window
    const elapsed = Math.min(this.windowMs, now - (this.counts[0] || now)) / 1000
    if (elapsed <= 0) return 0
    return Math.round(this.counts.length / Math.max(elapsed, 1))
  }
}

export function getRedisRequestsPerSecond(): number {
  return redisOpsTracker.getRequestsPerSecond()
}

class InlineLocalRedis {
  private store = new Map<string, RedisDataValue>()
  private persistenceEnabled = false
  private snapshotInterval: NodeJS.Timeout | null = null

  constructor() {
    // Constructor is empty - initialization happens in initialize()
  }

  async initialize(): Promise<void> {
    // Load snapshot from disk
    const snapshot = await RedisPersistenceManager.loadSnapshot()
    if (snapshot) {
      this.store = snapshot
    }

    // Enable periodic snapshots - every 4 minutes (240 seconds)
    if (!this.persistenceEnabled) {
      this.persistenceEnabled = true
      const snapshotIntervalMs = 4 * 60 * 1000 // 4 minutes = 240,000ms
      RedisPersistenceManager.startPeriodicSnapshots(this.store, snapshotIntervalMs)
      console.log("[v0] [Redis] Persistence initialized - snapshots every 4 minutes (240s)")
    }
  }

  async saveSnapshot(): Promise<void> {
    await RedisPersistenceManager.saveSnapshot(this.store)
  }

  private isExpired(entry: RedisDataValue | undefined): boolean {
    if (!entry) return true
    if (entry.expiresAt && entry.expiresAt < Date.now()) return true
    return false
  }

  private getEntry(key: string): RedisDataValue | null {
  redisOpsTracker.record()
  const entry = this.store.get(key)
  if (!entry || this.isExpired(entry)) {
  if (entry) this.store.delete(key)
  return null
  }
  return entry
  }

  async ping(): Promise<"PONG"> { return "PONG" }

  async get(key: string): Promise<string | null> {
    const entry = this.getEntry(key)
    if (entry?.type === "string") return entry.value as string
    return null
  }

  async set(key: string, value: string, options?: { ex?: number }): Promise<"OK"> {
    redisOpsTracker.record()
    this.store.set(key, {
      type: "string",
      value,
      expiresAt: options?.ex ? Date.now() + options.ex * 1000 : undefined,
    })
    return "OK"
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0
    for (const key of keys) {
      if (this.store.delete(key)) count++
    }
    return count
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0
    for (const key of keys) {
      if (this.getEntry(key)) count++
    }
    return count
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`)
    const result: string[] = []
    for (const [key] of this.store) {
      if (this.getEntry(key) && regex.test(key)) result.push(key)
    }
    return result
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.getEntry(key)
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000
      return 1
    }
    return 0
  }

  async ttl(key: string): Promise<number> {
    const entry = this.getEntry(key)
    if (!entry) return -2
    if (!entry.expiresAt) return -1
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000))
  }

  // Hash operations
  async hset(key: string, fieldOrObj: string | Record<string, any>, value?: string): Promise<number> {
    let entry = this.getEntry(key)
    if (!entry || entry.type !== "hash") {
      entry = { type: "hash", value: {} }
      this.store.set(key, entry)
    }
    const hash = entry.value as Record<string, string>
    if (typeof fieldOrObj === "object") {
      let count = 0
      for (const [f, v] of Object.entries(fieldOrObj)) {
        if (!(f in hash)) count++
        hash[f] = String(v ?? "")
      }

      return count
    }
    const isNew = !(fieldOrObj in hash)
    hash[fieldOrObj] = String(value ?? "")

    return isNew ? 1 : 0
  }

  async hget(key: string, field: string): Promise<string | null> {
    const entry = this.getEntry(key)
    if (entry?.type !== "hash") return null
    const hash = entry.value as Record<string, string>
    return hash[field] ?? null
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const entry = this.getEntry(key)
    if (entry?.type === "hash") return entry.value as Record<string, string>
    return {}
  }

  async hmset(key: string, ...args: string[]): Promise<"OK"> {
    let entry = this.getEntry(key)
    if (!entry || entry.type !== "hash") {
      entry = { type: "hash", value: {} }
      this.store.set(key, entry)
    }
    const hash = entry.value as Record<string, string>
    for (let i = 0; i < args.length; i += 2) {
      hash[args[i]] = args[i + 1]
    }
    return "OK"
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const entry = this.getEntry(key)
    if (entry?.type !== "hash") return 0
    const hash = entry.value as Record<string, string>
    let count = 0
    for (const f of fields) {
      if (f in hash) { delete hash[f]; count++ }
    }
    return count
  }

  async hexists(key: string, field: string): Promise<number> {
    const entry = this.getEntry(key)
    if (entry?.type !== "hash") return 0
    return field in (entry.value as Record<string, string>) ? 1 : 0
  }

  async hlen(key: string): Promise<number> {
    const entry = this.getEntry(key)
    if (entry?.type !== "hash") return 0
    return Object.keys(entry.value as Record<string, string>).length
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    let entry = this.getEntry(key)
    if (!entry || entry.type !== "set") {
      entry = { type: "set", value: new Set<string>() }
      this.store.set(key, entry)
    }
    const s = entry.value as Set<string>
    let count = 0
    for (const m of members) {
  if (!s.has(m)) {
  s.add(m)
  count++
  }
    }
    return count
  }

  async smembers(key: string): Promise<string[]> {
    const entry = this.getEntry(key)
    if (!entry) return []
    if (entry.type !== "set") return []
    return Array.from(entry.value as Set<string>)
  }

  async sismember(key: string, member: string): Promise<number> {
    const entry = this.getEntry(key)
    if (entry?.type !== "set") return 0
    return (entry.value as Set<string>).has(member) ? 1 : 0
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const entry = this.getEntry(key)
    if (entry?.type !== "set") return 0
    const s = entry.value as Set<string>
    let count = 0
    for (const m of members) {
      if (s.delete(m)) count++
    }
    return count
  }

  async scard(key: string): Promise<number> {
    const entry = this.getEntry(key)
    if (entry?.type !== "set") return 0
    return (entry.value as Set<string>).size
  }

  // Counter operations
  async incr(key: string): Promise<number> {
    const cur = parseInt(await this.get(key) || "0", 10)
    const next = cur + 1
    await this.set(key, String(next))
    return next
  }

  async decr(key: string): Promise<number> {
    const cur = parseInt(await this.get(key) || "0", 10)
    const next = cur - 1
    await this.set(key, String(next))
    return next
  }

  async incrby(key: string, inc: number): Promise<number> {
    const cur = parseInt(await this.get(key) || "0", 10)
    const next = cur + inc
    await this.set(key, String(next))
    return next
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map(k => this.get(k)))
  }

  async mset(...args: string[]): Promise<"OK"> {
    for (let i = 0; i < args.length; i += 2) {
      await this.set(args[i], args[i + 1])
    }
    return "OK"
  }

  async flushdb(): Promise<"OK"> {
    this.store.clear()
    return "OK"
  }

  async flushAll(): Promise<"OK"> {
    this.store.clear()
    return "OK"
  }

  async dbsize(): Promise<number> {
    let count = 0
    for (const [key] of this.store) {
      if (this.getEntry(key)) count++
    }
    return count
  }

  // List operations (stored as JSON strings internally)
  async lpush(key: string, ...values: string[]): Promise<number> {
    const existing = await this.get(key)
    const arr: string[] = existing ? JSON.parse(existing) : []
    arr.unshift(...values)
    await this.set(key, JSON.stringify(arr))
    return arr.length
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    const existing = await this.get(key)
    const arr: string[] = existing ? JSON.parse(existing) : []
    arr.push(...values)
    await this.set(key, JSON.stringify(arr))
    return arr.length
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const existing = await this.get(key)
    if (!existing) return []
    try {
      const arr: string[] = JSON.parse(existing)
      return arr.slice(start, stop === -1 ? undefined : stop + 1)
    } catch { return [] }
  }

  async llen(key: string): Promise<number> {
    const existing = await this.get(key)
    if (!existing) return 0
    try { return JSON.parse(existing).length } catch { return 0 }
  }

  // Sorted set operations (stored as JSON with score)
  async zadd(key: string, ...scoreMembers: (string | number)[]): Promise<number> {
    let entry = this.getEntry(key)
    if (!entry || entry.type !== "hash") {
      entry = { type: "hash", value: {} }
      this.store.set(key, entry)
    }
    const zset = entry.value as Record<string, string>
    let count = 0
    for (let i = 0; i < scoreMembers.length; i += 2) {
      const score = String(scoreMembers[i])
      const member = String(scoreMembers[i + 1])
      if (!(member in zset)) count++
      zset[member] = score
    }
    return count
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const entry = this.getEntry(key)
    if (entry?.type !== "hash") return []
    const zset = entry.value as Record<string, string>
    const members = Object.entries(zset)
      .sort((a, b) => parseFloat(a[1]) - parseFloat(b[1]))
      .map(([member]) => member)
    return members.slice(start, stop === -1 ? undefined : stop + 1)
  }

  async zcard(key: string): Promise<number> {
    const entry = this.getEntry(key)
    if (entry?.type !== "hash") return 0
    return Object.keys(entry.value as Record<string, string>).length
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const entry = this.getEntry(key)
    if (entry?.type !== "hash") return 0
    const zset = entry.value as Record<string, string>
    let count = 0
    for (const member of members) {
      if (member in zset) {
        delete zset[member]
        count++
      }
    }
    return count
  }

  // camelCase aliases for compatibility with code using node-redis / ioredis naming conventions
  async zAdd(key: string, ...scoreMembers: (string | number)[]) { return this.zadd(key, ...scoreMembers) }
  async zRange(key: string, start: number, stop: number) { return this.zrange(key, start, stop) }
  async zCard(key: string) { return this.zcard(key) }
  async zRem(key: string, ...members: string[]) { return this.zrem(key, ...members) }
  async hSet(key: string, fieldOrObj: string | Record<string, any>, value?: string) { return this.hset(key, fieldOrObj, value) }
  async hGet(key: string, field: string) { return this.hget(key, field) }
  async hGetAll(key: string) { return this.hgetall(key) }
  async hDel(key: string, ...fields: string[]) { return this.hdel(key, ...fields) }
  async sAdd(key: string, ...members: string[]) { return this.sadd(key, ...members) }
  async sMembers(key: string) { return this.smembers(key) }
  async sRem(key: string, ...members: string[]) { return this.srem(key, ...members) }
  async sIsMember(key: string, member: string) { return this.sismember(key, member) }
  async sCard(key: string) { return this.scard(key) }
  async hExists(key: string, field: string) { return this.hexists(key, field) }
  async hLen(key: string) { return this.hlen(key) }
  async hmSet(key: string, ...args: string[]) { return this.hmset(key, ...args) }
  async lPush(key: string, ...values: string[]) { return this.lpush(key, ...values) }
  async rPush(key: string, ...values: string[]) { return this.rpush(key, ...values) }
  async lRange(key: string, start: number, stop: number) { return this.lrange(key, start, stop) }
  async lLen(key: string) { return this.llen(key) }
  async incrBy(key: string, inc: number) { return this.incrby(key, inc) }
}

// ========== Singleton ==========

let redisInstance: InlineLocalRedis | null = null
let isConnected = false
let migrationsRun = false  // Flag to prevent re-running migrations

function getClient(): InlineLocalRedis {
  if (!redisInstance) {
    redisInstance = new InlineLocalRedis()
    isConnected = true
  }
  return redisInstance
}

// ========== Helpers ==========

function convertToString(value: any): string {
  if (value === true || value === "true" || value === 1 || value === "1") return "1"
  return "0"
}

function flattenForHmset(obj: Record<string, string>): string[] {
  const args: string[] = []
  for (const [k, v] of Object.entries(obj)) { args.push(k, v) }
  return args
}

// ========== Init / Client ==========

export async function initRedis(): Promise<void> {
  if (!redisInstance) {
    redisInstance = new InlineLocalRedis()
    await redisInstance.initialize() // Load snapshot and start persistence
    isConnected = true
    console.log("[v0] [Redis] Client initialized with persistence")
    
    const pong = await redisInstance.ping()
    if (pong === "PONG") {
      console.log("[v0] [Redis] Connection test successful")
    }
    
    // NOTE: Predefined connections (templates from file storage) are NOT migrated to Redis
    // They are informational only and should NOT be used by the trade engine
    // Only user-created connections should be stored in Redis for the engine to use
    
    // Initialize 6 user-created connections if they don't exist
    await initializeDefaultUserConnections()
  }
}

/**
 * Initialize 4 default user-created connections with predefined values
 * These are actual connections, not templates
 * Removes any predefined connections that may exist
 */
export async function initializeDefaultUserConnections(): Promise<void> {
  const client = getClient()
  try {
    // Always clear existing connections to ensure clean state
    const existingIds = await client.smembers("connections")
    if (existingIds && existingIds.length > 0) {
      console.log(`[v0] [Connections] Clearing ${existingIds.length} existing connections for fresh start`)
      for (const id of existingIds) {
        await client.del(`connection:${id}`)
        await client.srem("connections", id)
      }
    }
    
    console.log("[v0] [Connections] Initializing default connections with real API keys...")
    
    // Import predefined values for base exchanges
    const { CONNECTION_PREDEFINITIONS } = await import("@/lib/connection-predefinitions")
    
    // Find BingX predefined connection with real API keys
    const bingxPredefined = CONNECTION_PREDEFINITIONS.find((p: any) => p.exchange === "bingx")
    
    if (!bingxPredefined) {
      console.error("[v0] [Connections] BingX predefined connection not found!")
      return
    }
    
    console.log(`[v0] [Connections] Found BingX with apiKey length: ${bingxPredefined.apiKey?.length || 0}`)
    
    // Create BingX connection with REAL API keys from predefined
    const bingxData: Record<string, string> = {
      id: "conn-bingx-01",
      name: "BingX Live",
      exchange: "bingx",
      api_type: bingxPredefined.apiType,
      connection_method: bingxPredefined.connectionMethod,
      connection_library: bingxPredefined.connectionLibrary,
      margin_type: bingxPredefined.marginType,
      position_mode: bingxPredefined.positionMode,
      api_key: bingxPredefined.apiKey,
      api_secret: bingxPredefined.apiSecret,
      api_passphrase: "",
      is_testnet: "0",
      is_enabled: "1",
      is_enabled_dashboard: "1",
      is_live_trade: "0",
      is_predefined: "0",
      is_inserted: "1",
      is_active: "1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    await client.hset("connection:conn-bingx-01", bingxData)
    await client.sadd("connections", "conn-bingx-01")
    
    console.log(`[v0] [Connections] ✅ Created BingX Live [${bingxPredefined.apiType}] [ACTIVE with REAL keys]`)
    console.log(`[v0] [Connections] BingX API Key stored: ${bingxData.api_key.substring(0, 20)}...`)
    
    // Create 3 inactive placeholder connections for other exchanges
    const otherExchanges = [
      { id: "conn-bybit-01", name: "Bybit Live", exchange: "bybit" },
      { id: "conn-pionex-01", name: "Pionex Trading", exchange: "pionex" },
      { id: "conn-orangex-01", name: "OrangeX Trading", exchange: "orangex" },
    ]
    
    for (const ex of otherExchanges) {
      const exPredefined = CONNECTION_PREDEFINITIONS.find((p: any) => p.exchange === ex.exchange)
      if (!exPredefined) continue
      
      const exData: Record<string, string> = {
        id: ex.id,
        name: ex.name,
        exchange: ex.exchange,
        api_type: exPredefined.apiType,
        connection_method: exPredefined.connectionMethod,
        connection_library: exPredefined.connectionLibrary,
        margin_type: exPredefined.marginType,
        position_mode: exPredefined.positionMode,
        api_key: "",
        api_secret: "",
        api_passphrase: "",
        is_testnet: "0",
        is_enabled: "0",
        is_enabled_dashboard: "0",
        is_live_trade: "0",
        is_predefined: "0",
        is_inserted: "0", // Not inserted - user must add credentials
        is_active: "0",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      
      await client.hset(`connection:${ex.id}`, exData)
      await client.sadd("connections", ex.id)
      console.log(`[v0] [Connections] Created ${ex.exchange.toUpperCase()} - ${ex.name} [inactive - awaiting credentials]`)
    }
    
    console.log("[v0] [Connections] ✅ Successfully initialized: 1 ACTIVE (BingX with real keys) + 3 inactive placeholders")
  } catch (err) {
    console.error("[v0] [Connections] Error initializing user connections:", err instanceof Error ? err.message : String(err))
  }
}

export function getRedisClient() {
  return getClient()
}

export function haveMigrationsRun(): boolean {
  return migrationsRun
}

export function setMigrationsRun(value: boolean): void {
  migrationsRun = value
}

// ========== Connection CRUD ==========

export async function saveConnection(connection: any): Promise<void> {
  const client = getClient()
  const key = `connection:${connection.id}`
  const connectionData: Record<string, string> = {
    id: connection.id,
    name: connection.name,
    exchange: connection.exchange,
    api_key: connection.api_key || "",
    api_secret: connection.api_secret || "",
    api_type: connection.api_type || "spot",
    api_subtype: connection.api_subtype || "",
    connection_method: connection.connection_method || "rest",
    connection_library: connection.connection_library || "ccxt",
    margin_type: connection.margin_type || "isolated",
    position_mode: connection.position_mode || "one-way",
    is_testnet: convertToString(connection.is_testnet),
    is_enabled: convertToString(connection.is_enabled),
    is_enabled_dashboard: convertToString(connection.is_enabled_dashboard),
    is_dashboard_inserted: convertToString(connection.is_dashboard_inserted),
    is_inserted: convertToString(connection.is_inserted),
    is_active: convertToString(connection.is_active),
    is_predefined: convertToString(connection.is_predefined),
    is_live_trade: convertToString(connection.is_live_trade),
    is_preset_trade: convertToString(connection.is_preset_trade),
    api_passphrase: connection.api_passphrase || "",
    last_test_status: connection.last_test_status || "",
    last_test_balance: connection.last_test_balance || "",
    last_test_btc_price: connection.last_test_btc_price || "",
    last_test_at: connection.last_test_at || "",
    api_capabilities: connection.api_capabilities || "",
    created_at: connection.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  await client.hmset(key, ...flattenForHmset(connectionData))
  await client.sadd("connections", connection.id)
}

export async function getConnection(connectionId: string): Promise<any> {
  const client = getClient()
  if (!client) {
    console.warn("[v0] [DB] Redis client not available in getConnection")
    return null
  }
  
  const key = `connection:${connectionId}`
  try {
    const data = await client.hgetall(key)
    if (!data || Object.keys(data).length === 0) {
      console.log(`[v0] [DB] Connection ${connectionId} not found in Redis (key: ${key})`)
      return null
    }
    
    // Helper to convert string booleans to actual booleans
    const toBool = (val: any): boolean => {
      if (typeof val === 'boolean') return val
      if (typeof val === 'string') return val === '1' || val === 'true'
      return !!val
    }
    
    return {
      id: data.id, name: data.name, exchange: data.exchange,
      api_key: data.api_key || "", api_secret: data.api_secret || "",
      api_type: data.api_type || "spot", api_subtype: data.api_subtype || "",
      connection_method: data.connection_method || "rest",
      connection_library: data.connection_library || "ccxt",
      margin_type: data.margin_type || "isolated",
      position_mode: data.position_mode || "one-way",
      is_testnet: toBool(data.is_testnet), 
      is_enabled: toBool(data.is_enabled),
      is_enabled_dashboard: data.is_enabled_dashboard === "1" ? "1" : "0",
      is_active: toBool(data.is_active), 
      is_predefined: toBool(data.is_predefined),
      is_live_trade: toBool(data.is_live_trade), 
      is_preset_trade: toBool(data.is_preset_trade),
      api_passphrase: data.api_passphrase || "",
      last_test_status: data.last_test_status || "",
      last_test_balance: data.last_test_balance || "",
      last_test_btc_price: data.last_test_btc_price || "",
      last_test_at: data.last_test_at || "",
      api_capabilities: data.api_capabilities || "",
      created_at: data.created_at, 
      updated_at: data.updated_at,
    }
  } catch (error) {
    console.error(`[v0] [DB] Error fetching connection ${connectionId}:`, error)
    return null
  }
}

export async function updateConnection(connectionId: string, updates: any): Promise<void> {
  const connection = await getConnection(connectionId)
  if (!connection) throw new Error(`Connection ${connectionId} not found`)
  await saveConnection({ ...connection, ...updates })
}

export async function getAllConnections(): Promise<any[]> {
  const client = getClient()
  try {
    const ids = await client.smembers("connections")
    
    // Return only user-created connections from Redis
    // Predefined/template connections are kept in file storage as informational only
    if (!ids || ids.length === 0) {
      console.log("[v0] [DB] No user-created connections in Redis (predefined templates are file-based only)")
      return []
    }
    
    // Fetch all user-created connections in parallel
    const results = await Promise.all(
      ids.map(id => client.hgetall(`connection:${id}`))
    )
    
    const connections = []
    for (let i = 0; i < results.length; i++) {
      const data = results[i]
      
      if (data && Object.keys(data).length > 0) {
        // Helper to convert string booleans to actual booleans
        const toBool = (val: any): boolean => {
          if (typeof val === 'boolean') return val
          if (typeof val === 'string') return val === '1' || val === 'true'
          return !!val
        }
        
        // Parse test logs from JSON string if needed
        let testLogs: string[] = []
        if (data.last_test_log) {
          try {
            if (typeof data.last_test_log === 'string') {
              testLogs = JSON.parse(data.last_test_log)
            } else if (Array.isArray(data.last_test_log)) {
              testLogs = data.last_test_log
            }
          } catch (e) {
            testLogs = [data.last_test_log]
          }
        }

        connections.push({
          id: data.id,
          name: data.name,
          exchange: data.exchange,
          api_key: data.api_key || "",
          api_secret: data.api_secret || "",
          api_type: data.api_type || "spot",
          api_subtype: data.api_subtype || "",
          connection_method: data.connection_method || "rest",
          connection_library: data.connection_library || "ccxt",
          margin_type: data.margin_type || "isolated",
          position_mode: data.position_mode || "one-way",
          is_testnet: toBool(data.is_testnet),
          is_enabled: toBool(data.is_enabled),
          is_enabled_dashboard: toBool(data.is_enabled_dashboard),
          is_dashboard_inserted: data.is_dashboard_inserted,
          is_active: toBool(data.is_active),
          is_predefined: toBool(data.is_predefined),
          is_inserted: toBool(data.is_inserted),
          is_live_trade: toBool(data.is_live_trade),
          is_preset_trade: toBool(data.is_preset_trade),
          api_passphrase: data.api_passphrase || "",
          last_test_status: data.last_test_status || "",
          last_test_balance: data.last_test_balance ? parseFloat(data.last_test_balance) : 0,
          last_test_log: testLogs,
          last_test_at: data.last_test_at || null,
          api_capabilities: data.api_capabilities || "",
          created_at: data.created_at,
          updated_at: data.updated_at,
        })
      }
    }
    return connections
  } catch (error) {
    console.error("[v0] [DB] Failed to get user-created connections:", error)
    return []
  }
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const client = getClient()
  await client.del(`connection:${connectionId}`)
  await client.srem("connections", connectionId)
}

// Inline base exchange list - no external imports to avoid caching issues
const _BASE_EXCHANGES = ["bybit", "bingx", "pionex", "orangex"]

/**
 * Get enabled connections (respects inserted state)
 * Auto-inserted exchanges (bybit, bingx) are enabled by default
 * Other connections start disabled unless explicitly enabled by user
 * @returns Array of enabled connections
 */
export async function getEnabledConnections(): Promise<any[]> {
  const all = await getAllConnections()
  const filtered = all.filter((c: any) => {
    const isEnabled = c.is_enabled === "1" || c.is_enabled === true || c.is_enabled === "true"
    return isEnabled
  })
  console.log(`[v0] [DB] getEnabledConnections: ${filtered.length} enabled out of ${all.length} | ${filtered.map((c: any) => c.name || c.id).join(", ")}`)
  return filtered
}

/**
 * Get active connections for trade engine
 * Active = is_enabled_dashboard === true (visible on dashboard)
 * These are the ONLY connections the trade engine should process
 */
export async function getActiveConnectionsForEngine(): Promise<any[]> {
  const all = await getAllConnections()
  
  // Debug: log all connections and their dashboard states
  console.log(`[v0] [DB] [ActiveConnections] Found ${all.length} total connections:`)
  all.forEach((c: any) => {
    const isDashboardEnabled = c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === "true"
    const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
    const status = isPredefined ? "(PREDEFINED - template only)" : "(USER-CREATED)"
    console.log(`  - ${c.name}: dashboard_enabled=${isDashboardEnabled}, ${status}`)
  })
  
  // Filter for ONLY user-created (non-predefined) connections that are dashboard-enabled
  const filtered = all.filter((c: any) => {
    // Must be dashboard-enabled
    const isEnabled = c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === "true"
    
    // Must NOT be a predefined/template connection
    const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
    
    // Return only user-created, enabled connections
    return isEnabled && !isPredefined
  })
  
  // Log with full detail: which connections are active vs inactive
  if (filtered.length > 0) {
    const activeIds = filtered.map((c: any) => c.id).join(", ")
    console.log(`[v0] [DB] [ActiveConnections] ${filtered.length}/${all.length} active (user-created, enabled_dashboard=true): [${activeIds}]`)
  } else {
    const userCreated = all.filter((c: any) => {
      const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
      return !isPredefined
    })
    const baseIds = all.filter((c: any) => {
      const isBase = ["bybit", "bingx", "pionex", "orangex", "binance", "okx"].includes((c.exchange || "").toLowerCase())
      return isBase
    }).map((c: any) => c.id).join(", ")
    console.log(`[v0] [DB] [ActiveConnections] 0 active out of ${all.length} total (${userCreated.length} user-created, ${all.length - userCreated.length} predefined/templates) | Available templates: [${baseIds}]`)
  }
  
  return filtered
}

export async function createConnection(connection: any): Promise<any> {
  await saveConnection(connection)
  return connection
}

// ========== Trade CRUD ==========

export async function createTrade(connectionId: string, trade: any): Promise<any> {
  const client = getClient()
  const td: Record<string, string> = {}
  for (const [k, v] of Object.entries(trade)) {
    td[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hmset(`trade:${trade.id}`, ...flattenForHmset(td))
  await client.sadd(`trades:${connectionId}`, trade.id)
  return trade
}

export async function getTrade(tradeId: string): Promise<any> {
  const client = getClient()
  const data = await client.hgetall(`trade:${tradeId}`)
  if (!data || Object.keys(data).length === 0) return null
  return data
}

export async function getConnectionTrades(connectionId: string): Promise<any[]> {
  const client = getClient()
  const ids = await client.smembers(`trades:${connectionId}`)
  if (!ids || ids.length === 0) return []
  
  // Fetch all trades in parallel
  const results = await Promise.all(
    ids.map(id => client.hgetall(`trade:${id}`))
  )
  
  const trades = []
  for (const data of results) {
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      trades.push(data)
    }
  }
  return trades
}

export async function updateTrade(tradeId: string, updates: any): Promise<any> {
  const client = getClient()
  const existing = await getTrade(tradeId)
  if (!existing) throw new Error(`Trade ${tradeId} not found`)
  const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
  const td: Record<string, string> = {}
  for (const [k, v] of Object.entries(updated)) {
    td[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hmset(`trade:${tradeId}`, ...flattenForHmset(td))
  return updated
}

// ========== Position CRUD ==========

export async function createPosition(connectionId: string, position: any): Promise<any> {
  const client = getClient()
  const pd: Record<string, string> = {}
  for (const [k, v] of Object.entries(position)) {
    pd[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hmset(`position:${position.id}`, ...flattenForHmset(pd))
  await client.sadd(`positions:${connectionId}`, position.id)
  return position
}

export async function getPosition(positionId: string): Promise<any> {
  const client = getClient()
  const data = await client.hgetall(`position:${positionId}`)
  if (!data || Object.keys(data).length === 0) return null
  return data
}

export async function getConnectionPositions(connectionId: string): Promise<any[]> {
  const client = getClient()
  const ids = await client.smembers(`positions:${connectionId}`)
  if (!ids || ids.length === 0) return []
  
  // Fetch all positions in parallel
  const results = await Promise.all(
    ids.map(id => client.hgetall(`position:${id}`))
  )
  
  const positions = []
  for (const data of results) {
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      positions.push(data)
    }
  }
  return positions
}

export async function updatePosition(positionId: string, updates: any): Promise<any> {
  const client = getClient()
  const existing = await getPosition(positionId)
  if (!existing) throw new Error(`Position ${positionId} not found`)
  const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
  const pd: Record<string, string> = {}
  for (const [k, v] of Object.entries(updated)) {
    pd[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hmset(`position:${positionId}`, ...flattenForHmset(pd))
  return updated
}

export async function deletePosition(connectionId: string, positionId: string): Promise<void> {
  const client = getClient()
  await client.del(`position:${positionId}`)
  await client.srem(`positions:${connectionId}`, positionId)
}

// ========== Settings ==========

export async function setSettings(key: string, value: any): Promise<void> {
  const client = getClient()
  await client.set(`settings:${key}`, JSON.stringify(value))
}

export async function getSettings(key: string): Promise<any> {
  const client = getClient()
  const value = await client.get(`settings:${key}`)
  if (value === null || value === undefined) return null
  try { return typeof value === "string" ? JSON.parse(value) : value } catch { return value }
}

export async function deleteSettings(key: string): Promise<void> {
  const client = getClient()
  await client.del(`settings:${key}`)
}

// ========== Utilities ==========

export async function flushAll(): Promise<void> {
  const client = getClient()
  await client.flushdb()
}

export async function closeRedis(): Promise<void> {
  isConnected = false
}

export function isRedisConnected(): boolean {
  return isConnected
}

export async function getRedisStats(): Promise<any> {
  try {
    const client = getClient()
    const dbSize = await client.dbsize()
    return { 
      connected: true, 
      dbSize,
      keyCount: dbSize,  // Add keyCount for compatibility
      total_keys: dbSize,  // Add total_keys for compatibility
      timestamp: new Date().toISOString() 
    }
  } catch (error) {
    return { connected: false, error: String(error) }
  }
}

export async function verifyRedisHealth(): Promise<boolean> {
  try {
    const client = getClient()
    const ping = await client.ping()
    return ping === "PONG"
  } catch { return false }
}

// ========== Indications ==========

export async function saveIndication(connectionId: string, indication: any): Promise<void> {
  const client = getClient()
  const id: Record<string, string> = {}
  for (const [k, v] of Object.entries(indication)) {
    id[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hmset(`indication:${indication.id}`, ...flattenForHmset(id))
  await client.sadd(`indications:${connectionId}`, indication.id)
}

export async function getIndications(connectionId: string): Promise<any[]> {
  const client = getClient()
  try {
    // Check if indications set exists before calling smembers to avoid log spam
    const indicationKey = `indications:${connectionId}`
    const exists = await client.exists(indicationKey)
    if (!exists) {
      // Key doesn't exist - return empty array without logging
      return []
    }
    
    const ids = await client.smembers(indicationKey)
    if (!ids || ids.length === 0) return []
    const indications = []
    for (const indicationId of ids) {
      const data = await client.hgetall(`indication:${indicationId}`)
      if (data && Object.keys(data).length > 0) indications.push(data)
    }
    return indications
  } catch (error) {
    console.warn(`[v0] [DB] Error getting indications for ${connectionId}:`, error)
    return []
  }
}

// ========== Market Data ==========

export async function saveMarketData(symbol: string, data: any): Promise<void> {
  const client = getClient()
  const md: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    md[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
  }
  await client.hmset(`market_data:${symbol}`, ...flattenForHmset(md))
  await client.expire(`market_data:${symbol}`, 300)
}

export async function getMarketData(symbol: string): Promise<any> {
  const client = getClient()
  const data = await client.hgetall(`market_data:${symbol}`)
  if (!data || Object.keys(data).length === 0) return null
  return data
}

// ========== Backward-compat aliases ==========

export const saveTrade = createTrade
export const savePosition = createPosition
export const getTradesForConnection = getConnectionTrades
export const getPositionsForConnection = getConnectionPositions
