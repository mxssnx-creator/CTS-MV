/**
 * Redis Database Layer
 * In-memory Redis client with persistence to file system
 * Handles all database operations for connections, trades, positions, settings
 */

import fs from "fs"
import path from "path"

interface RedisData {
  strings: Map<string, string>
  hashes: Map<string, Record<string, string>>
  sets: Map<string, Set<string>>
  lists: Map<string, string[]>
  sorted_sets: Map<string, Array<{ score: number; member: string }>>
}

export class InlineLocalRedis {
  private data: RedisData = {
    strings: new Map(),
    hashes: new Map(),
    sets: new Map(),
    lists: new Map(),
    sorted_sets: new Map(),
  }
  private persistencePath = path.join(process.cwd(), ".redis-data.json")

  async ping() {
    return "PONG"
  }

  async get(key: string): Promise<string | null> {
    return this.data.strings.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.data.strings.set(key, value)
    this.save()
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0
    for (const key of keys) {
      if (this.data.strings.delete(key)) count++
      else if (this.data.hashes.delete(key)) count++
      else if (this.data.sets.delete(key)) count++
      else if (this.data.lists.delete(key)) count++
      else if (this.data.sorted_sets.delete(key)) count++
    }
    this.save()
    return count
  }

  async hset(key: string, data: Record<string, string>): Promise<number> {
    const existing = this.data.hashes.get(key) || {}
    const updates = Object.keys(data).length
    this.data.hashes.set(key, { ...existing, ...data })
    this.save()
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
    this.save()
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    return this.data.hashes.get(key) ?? null
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.data.sets.get(key) || new Set()
    const sizeBefore = set.size
    for (const member of members) {
      if (member) set.add(member)
    }
    this.data.sets.set(key, set)
    this.save()
    return set.size - sizeBefore
  }

  async scard(key: string): Promise<number> {
    return this.data.sets.get(key)?.size ?? 0
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.data.sets.get(key) || new Set())
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.data.sets.get(key)
    if (!set) return 0
    let removed = 0
    for (const member of members) {
      if (set.delete(member)) removed++
    }
    if (set.size === 0) this.data.sets.delete(key)
    else this.data.sets.set(key, set)
    this.save()
    return removed
  }

  async expire(key: string, seconds: number): Promise<number> {
    // TTL not implemented in memory, but track for future
    return 1
  }

  async dbSize(): Promise<number> {
    const total = this.data.strings.size + this.data.hashes.size + this.data.sets.size + this.data.lists.size + this.data.sorted_sets.size
    return total
  }

  private save(): void {
    try {
      const data = {
        strings: Array.from(this.data.strings.entries()),
        hashes: Array.from(this.data.hashes.entries()),
        sets: Array.from(this.data.sets.entries()).map(([k, v]) => [k, Array.from(v)]),
        lists: Array.from(this.data.lists.entries()),
        sorted_sets: Array.from(this.data.sorted_sets.entries()),
      }
      fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2))
    } catch (e) {
      console.error("[v0] Failed to save Redis data:", e)
    }
  }

  async load(): Promise<void> {
    try {
      if (fs.existsSync(this.persistencePath)) {
        const content = fs.readFileSync(this.persistencePath, "utf-8")
        const data = JSON.parse(content)
        this.data.strings = new Map(data.strings || [])
        this.data.hashes = new Map(data.hashes || [])
        this.data.sets = new Map((data.sets || []).map(([k, v]: any) => [k, new Set(v)]))
        this.data.lists = new Map(data.lists || [])
        this.data.sorted_sets = new Map(data.sorted_sets || [])
      }
    } catch (e) {
      console.error("[v0] Failed to load Redis data:", e)
    }
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
  return {
    connected: isConnected,
    dbSize: size,
    uptimeSeconds: process.uptime(),
  }
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
