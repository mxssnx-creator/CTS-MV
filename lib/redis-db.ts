/**
 * Redis Database Layer
 * In-memory Redis client for Next.js runtime
 * Handles all database operations for connections, trades, positions, settings
 * 
 * IMPORTANT: This file must NOT import 'fs' or 'path' as it's used by client components
 * Data persists in globalThis across hot reloads
 */

interface RedisData {
  strings: Map<string, string>
  hashes: Map<string, Record<string, string>>
  sets: Map<string, Set<string>>
  lists: Map<string, string[]>
  sorted_sets: Map<string, Array<{ score: number; member: string }>>
  requestStats: {
    lastSecond: number
    requestCount: number
    operationsPerSecond: number
  }
}

// Global storage for persistence across hot reloads
const globalForRedis = globalThis as unknown as { __redis_data?: RedisData }

export class InlineLocalRedis {
  private data: RedisData

  constructor() {
    // Use global storage for persistence across hot reloads
    if (!globalForRedis.__redis_data) {
      globalForRedis.__redis_data = {
        strings: new Map(),
        hashes: new Map(),
        sets: new Map(),
        lists: new Map(),
        sorted_sets: new Map(),
        requestStats: {
          lastSecond: Math.floor(Date.now() / 1000),
          requestCount: 0,
          operationsPerSecond: 0,
        },
      }
    }
    this.data = globalForRedis.__redis_data
  }

  /**
   * Track a Redis operation for accurate requests per second calculation
   */
  private trackOperation(): void {
    const now = Math.floor(Date.now() / 1000)
    
    // Initialize requestStats if it doesn't exist (for existing data without this field)
    if (!this.data.requestStats) {
      this.data.requestStats = {
        lastSecond: now,
        requestCount: 0,
        operationsPerSecond: 0,
      }
    }
    
    const stats = this.data.requestStats
    
    if (now > stats.lastSecond) {
      // New second: save current count and reset
      stats.operationsPerSecond = stats.requestCount
      stats.requestCount = 1
      stats.lastSecond = now
    } else {
      // Same second: increment count
      stats.requestCount++
    }
  }

  async ping() {
    return "PONG"
  }

  async get(key: string): Promise<string | null> {
    this.trackOperation()
    return this.data.strings.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.trackOperation()
    this.data.strings.set(key, value)
  }

  async del(...keys: string[]): Promise<number> {
    this.trackOperation()
    let count = 0
    for (const key of keys) {
      if (this.data.strings.delete(key)) count++
      else if (this.data.hashes.delete(key)) count++
      else if (this.data.sets.delete(key)) count++
      else if (this.data.lists.delete(key)) count++
      else if (this.data.sorted_sets.delete(key)) count++
    }
    return count
  }

  async hset(key: string, data: Record<string, string>): Promise<number> {
    this.trackOperation()
    const existing = this.data.hashes.get(key) || {}
    const updates = Object.keys(data).length
    this.data.hashes.set(key, { ...existing, ...data })
    return updates
  }

  async hmset(...args: string[]): Promise<void> {
    if (args.length < 3) return
    const key = args[0]
    const obj: Record<string, string> = {}
    for (let i = 1; i < args.length; i += 2) {
      obj[args[i]] = args[i + 1]
    }
    this.data.hashes.set(key, { ...this.data.hashes.get(key), ...obj })
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    this.trackOperation()
    return this.data.hashes.get(key) ?? null
  }

  async hlen(key: string): Promise<number> {
    this.trackOperation()
    const hash = this.data.hashes.get(key)
    return hash ? Object.keys(hash).length : 0
  }

  async hget(key: string, field: string): Promise<string | null> {
    this.trackOperation()
    const hash = this.data.hashes.get(key)
    return hash?.[field] ?? null
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    this.trackOperation()
    const hash = this.data.hashes.get(key)
    if (!hash) return 0
    let deleted = 0
    for (const field of fields) {
      if (field in hash) {
        delete hash[field]
        deleted++
      }
    }
    if (Object.keys(hash).length === 0) {
      this.data.hashes.delete(key)
    }
    return deleted
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    this.trackOperation()
    const set = this.data.sets.get(key) || new Set()
    const sizeBefore = set.size
    for (const member of members) {
      if (member) set.add(member)
    }
    this.data.sets.set(key, set)
    return set.size - sizeBefore
  }

  async scard(key: string): Promise<number> {
    this.trackOperation()
    return this.data.sets.get(key)?.size ?? 0
  }

  async smembers(key: string): Promise<string[]> {
    this.trackOperation()
    return Array.from(this.data.sets.get(key) || new Set())
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    this.trackOperation()
    const set = this.data.sets.get(key)
    if (!set) return 0
    let removed = 0
    for (const member of members) {
      if (set.delete(member)) removed++
    }
    if (set.size === 0) this.data.sets.delete(key)
    else this.data.sets.set(key, set)
    return removed
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.trackOperation()
    // TTL not implemented in memory
    return 1
  }

  async dbSize(): Promise<number> {
    this.trackOperation()
    return this.data.strings.size + this.data.hashes.size + this.data.sets.size + this.data.lists.size + this.data.sorted_sets.size
  }

  async keys(pattern: string): Promise<string[]> {
    this.trackOperation()
    // Convert Redis glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")
    const regex = new RegExp(`^${regexPattern}$`)
    
    const allKeys: string[] = []
    // Collect keys from all data structures
    for (const key of this.data.strings.keys()) {
      if (regex.test(key)) allKeys.push(key)
    }
    for (const key of this.data.hashes.keys()) {
      if (regex.test(key)) allKeys.push(key)
    }
    for (const key of this.data.sets.keys()) {
      if (regex.test(key)) allKeys.push(key)
    }
    for (const key of this.data.lists.keys()) {
      if (regex.test(key)) allKeys.push(key)
    }
    for (const key of this.data.sorted_sets.keys()) {
      if (regex.test(key)) allKeys.push(key)
    }
    return allKeys
  }

  async load(): Promise<void> {
    // No-op: data is already in global memory
  }
}

let redisInstance: InlineLocalRedis | null = null
let isConnected = false
let connectionsInitialized = false

export async function initRedis(): Promise<void> {
  if (isConnected) return

  if (!redisInstance) {
    redisInstance = new InlineLocalRedis()
    await redisInstance.load()
  }

  isConnected = true
  console.log("[v0] [Redis] Client initialized with persistence")

  const pong = await redisInstance.ping()
  if (pong === "PONG") {
    console.log("[v0] [Redis] Connection test successful")
  }

  // NOTE: Do NOT initialize user-created connections here
  // Migrations 011-016 already set up all 15 predefined template connections
  // and mark 4 as "base" (is_inserted=1, is_enabled=1, is_active_inserted=1)
  // Creating separate "conn-*" connections would create duplicates on dashboard
  if (!connectionsInitialized) {
    connectionsInitialized = true
    console.log("[v0] [Connections] ✓ Connection initialization skipped (handled by migrations 011-016)")
  }
}

export function getClient(): InlineLocalRedis {
  if (!redisInstance) {
    redisInstance = new InlineLocalRedis()
    isConnected = true
  }
  return redisInstance
}

export function isRedisConnected(): boolean {
  return isConnected
}

// ========== Helpers ==========

function convertToString(value: any): string {
  // Handle booleans specially
  if (value === true) return "1"
  if (value === false) return "0"
  // Handle null/undefined
  if (value === null || value === undefined) return ""
  // Convert everything else to string
  return String(value)
}

function flattenForHmset(obj: Record<string, string>): string[] {
  const args: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    args.push(k, v)
  }
  return args
}

// ========== Connection Operations ==========

export async function getAllConnections(): Promise<any[]> {
  const client = getClient()
  const connIds = await client.smembers("connections")

  if (!connIds || connIds.length === 0) {
    console.log("[v0] [Connections] No connections found in set")
    return []
  }

  const connections = []
  for (const id of connIds) {
    const data = await client.hgetall(`connection:${id}`)
    if (data && Object.keys(data).length > 0) {
      connections.push(data)
    }
  }

  return connections
}

export async function getConnection(id: string): Promise<any | null> {
  const client = getClient()
  const data = await client.hgetall(`connection:${id}`)
  return data && Object.keys(data).length > 0 ? data : null
}

export async function createConnection(data: Record<string, any>): Promise<void> {
  const client = getClient()
  const id = data.id
  if (!id) throw new Error("Connection ID is required")

  const flattened: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    flattened[k] = convertToString(v)
  }

  await client.hset(`connection:${id}`, flattened)
  await client.sadd("connections", id)
}

export async function updateConnection(id: string, updates: Record<string, any>): Promise<void> {
  const client = getClient()
  const flattened: Record<string, string> = {}
  for (const [k, v] of Object.entries(updates)) {
    flattened[k] = convertToString(v)
  }

  await client.hset(`connection:${id}`, flattened)
}

export async function deleteConnection(id: string): Promise<void> {
  const client = getClient()
  await client.del(`connection:${id}`)
  await client.srem("connections", id)
}

// ========== Settings Operations ==========

export async function setSettings(key: string, value: any): Promise<void> {
  const client = getClient()
  const serialized = typeof value === "string" ? value : JSON.stringify(value)
  await client.set(`settings:${key}`, serialized)
}

export async function getSettings(key: string): Promise<any | null> {
  const client = getClient()
  const value = await client.get(`settings:${key}`)
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// ========== Market Data ==========

export async function saveMarketData(symbol: string, data: any): Promise<void> {
  const client = getClient()
  const key = `market_data:${symbol}`
  await client.set(key, JSON.stringify(data))
}

export async function getMarketData(symbol: string): Promise<any | null> {
  const client = getClient()
  const value = await client.get(`market_data:${symbol}`)
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

// ========== Migration State ==========

export async function setMigrationsRun(): Promise<void> {
  const client = getClient()
  await client.set("_migrations_run", "true")
}

export function haveMigrationsRun(): boolean {
  // Check process memory
  return (global as any).__migrations_run === true
}

// ========== Aliases for backward compatibility ==========

// Alias: getRedisClient -> getClient (used by many modules)
export function getRedisClient(): InlineLocalRedis {
  return getClient()
}

// Alias: saveConnection -> createConnection (used by some modules)
export async function saveConnection(data: Record<string, any>): Promise<void> {
  return createConnection(data)
}

// ========== Additional operations for compatibility ==========

export async function deleteSettings(key: string): Promise<void> {
  const client = getClient()
  await client.del(`settings:${key}`)
}

export async function flushAll(): Promise<void> {
  // Clear all data - dangerous operation
  const client = getClient()
  const keys = await client.smembers("connections")
  for (const k of keys) {
    await client.del(`connection:${k}`)
  }
  // Note: This is a simplified flush - in production would iterate all keys
  console.log("[v0] [Redis] flushAll called - cleared connections")
}

export async function getIndications(connectionId: string): Promise<any[]> {
  const client = getClient()
  const value = await client.get(`indications:${connectionId}`)
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

export async function saveIndication(connectionId: string, indication: any): Promise<void> {
  const client = getClient()
  const existing = await getIndications(connectionId)
  existing.push(indication)
  // Keep last 1000 indications
  const trimmed = existing.slice(-1000)
  await client.set(`indications:${connectionId}`, JSON.stringify(trimmed))
}

export async function getRedisStats(): Promise<any> {
  const client = getClient()
  const size = await client.dbSize()
  const allKeys = await client.keys("*").catch(() => [])
  const keyCount = Array.isArray(allKeys) ? allKeys.length : size
  return {
    connected: isConnected,
    dbSize: size,
    keyCount: keyCount,
    total_keys: keyCount,
    uptimeSeconds: process.uptime(),
    uptime_seconds: process.uptime(),
    memory_used: "N/A",
  }
}

export function getRedisRequestsPerSecond(): number {
  // Get the accurate requests per second from tracking
  const globalData = globalThis as unknown as { __redis_data?: RedisData }
  if (!globalData.__redis_data?.requestStats) return 0
  
  // Return the operations from the last completed second
  const rps = globalData.__redis_data.requestStats.operationsPerSecond
  return Math.max(1, rps) // At least 1 RPS if system is active
}

export async function verifyRedisHealth(): Promise<{ healthy: boolean; message: string }> {
  try {
    const client = getClient()
    const pong = await client.ping()
    return { healthy: pong === "PONG", message: "Redis is healthy" }
  } catch (e) {
    return { healthy: false, message: e instanceof Error ? e.message : "Unknown error" }
  }
}

// ========== Connection Queries ==========

export async function getActiveConnectionsForEngine(): Promise<any[]> {
  const allConnections = await getAllConnections()
  // Filter for connections that are:
  // 1. Active-inserted (in Active panel) AND enabled (is_enabled OR is_enabled_dashboard)
  // 2. Either has credentials OR is set to testnet/demo mode
  const filtered = allConnections.filter((c: any) => {
    const isActiveInserted = c.is_active_inserted === "1" || c.is_active_inserted === true
    const isEnabled = c.is_enabled === "1" || c.is_enabled === true
    const isDashboardEnabled = c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === true
    
    // Check for credentials (from connection OR from environment)
    const apiKey = c.api_key || c.apiKey || ""
    const apiSecret = c.api_secret || c.apiSecret || ""
    const hasCredentials = apiKey.length > 10 && apiSecret.length > 10
    
    // Check for testnet/demo mode
    const isTestnet = c.is_testnet === "1" || c.is_testnet === true
    const isDemoMode = c.demo_mode === "1" || c.demo_mode === true
    
    // Connection must be in Active panel AND enabled
    const isReadyForEngine = isActiveInserted && (isEnabled || isDashboardEnabled)
    
    // AND either have valid credentials OR be in testnet/demo mode
    return isReadyForEngine && (hasCredentials || isTestnet || isDemoMode)
  })
  
  console.log(`[v0] [Engine] Active connections for engine: ${filtered.length} (from ${allConnections.length} total)`)
  return filtered
}

export async function getEnabledConnections(): Promise<any[]> {
  const allConnections = await getAllConnections()
  return allConnections.filter((c: any) => c.is_enabled === "1" || c.is_enabled === true)
}

export async function getInsertedAndEnabledConnections(): Promise<any[]> {
  const allConnections = await getAllConnections()
  // Return connections that are:
  // 1. Inserted into Settings (is_inserted="1")
  // 2. AND enabled (is_enabled="1")
  // This is the filter used by the trade engine coordinator to find active connections
  return allConnections.filter((c: any) => {
    const isInserted = c.is_inserted === "1" || c.is_inserted === true
    const isEnabled = c.is_enabled === "1" || c.is_enabled === true
    return isInserted && isEnabled
  })
}

// ========== Stats Operations ==========

export async function closeRedis(): Promise<void> {
  // No-op for in-memory implementation
  isConnected = false
}

// ========== Position Operations ==========

export async function createPosition(data: Record<string, any>): Promise<void> {
  const client = getClient()
  const id = data.id || `pos_${Date.now()}`
  const flattened: Record<string, string> = { id }
  for (const [k, v] of Object.entries(data)) {
    flattened[k] = convertToString(v)
  }
  await client.hset(`position:${id}`, flattened)
  await client.sadd("positions", id)
}

export async function getPosition(id: string): Promise<any | null> {
  const client = getClient()
  const data = await client.hgetall(`position:${id}`)
  return data && Object.keys(data).length > 0 ? data : null
}

export async function updatePosition(id: string, updates: Record<string, any>): Promise<void> {
  const client = getClient()
  const flattened: Record<string, string> = {}
  for (const [k, v] of Object.entries(updates)) {
    flattened[k] = convertToString(v)
  }
  await client.hset(`position:${id}`, flattened)
}

export async function deletePosition(id: string): Promise<void> {
  const client = getClient()
  await client.del(`position:${id}`)
  await client.srem("positions", id)
}

export async function getConnectionPositions(connectionId: string): Promise<any[]> {
  const client = getClient()
  const positionIds = await client.smembers("positions")
  const positions = []
  for (const id of positionIds) {
    const pos = await getPosition(id)
    if (pos && pos.connection_id === connectionId) {
      positions.push(pos)
    }
  }
  return positions
}

// ========== Trade Operations ==========

export async function createTrade(data: Record<string, any>): Promise<void> {
  const client = getClient()
  const id = data.id || `trade_${Date.now()}`
  const flattened: Record<string, string> = { id }
  for (const [k, v] of Object.entries(data)) {
    flattened[k] = convertToString(v)
  }
  await client.hset(`trade:${id}`, flattened)
  await client.sadd("trades", id)
}

export async function getTrade(id: string): Promise<any | null> {
  const client = getClient()
  const data = await client.hgetall(`trade:${id}`)
  return data && Object.keys(data).length > 0 ? data : null
}

export async function updateTrade(id: string, updates: Record<string, any>): Promise<void> {
  const client = getClient()
  const flattened: Record<string, string> = {}
  for (const [k, v] of Object.entries(updates)) {
    flattened[k] = convertToString(v)
  }
  await client.hset(`trade:${id}`, flattened)
}

export async function getConnectionTrades(connectionId: string): Promise<any[]> {
  const client = getClient()
  const tradeIds = await client.smembers("trades")
  const trades = []
  for (const id of tradeIds) {
    const trade = await getTrade(id)
    if (trade && trade.connection_id === connectionId) {
      trades.push(trade)
    }
  }
  return trades
}
