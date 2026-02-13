/**
 * Redis Operations Module - Complete system data operations with lowercase Upstash methods
 * All Redis method calls use lowercase (hset, hgetall, smembers, sadd, srem, etc.)
 * Provides: RedisUsers, RedisConnections, RedisTrades, RedisPositions, RedisStrategies,
 *           RedisPresets, RedisMonitoring, RedisCache, RedisSettings, RedisBackup, RedisBulkOps
 */

import { getRedisClient } from "./redis-db"

export const RedisUsers = {
  async createUser(userId: number, data: Record<string, any>) {
    const client = getRedisClient()
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) flat[k] = String(v ?? "")
    await client.hset(`user:${userId}`, flat)
    await client.sadd("users:all", String(userId))
    return data
  },
  async getUser(userId: number) {
    const client = getRedisClient()
    const data = await client.hgetall(`user:${userId}`)
    if (!data || Object.keys(data).length === 0) return null
    return data
  },
  async getAllUsers() {
    const client = getRedisClient()
    try {
      const ids = await client.smembers("users:all")
      return Array.isArray(ids) ? ids : []
    } catch { return [] }
  },
}

export const RedisConnections = {
  async createConnection(connId: string, data: Record<string, any>) {
    const client = getRedisClient()
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) flat[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
    await client.hset(`connection:${connId}`, flat)
    await client.sadd("connections:all", connId)
    return data
  },
  async getConnection(connId: string) {
    const client = getRedisClient()
    const data = await client.hgetall(`connection:${connId}`)
    if (!data || Object.keys(data).length === 0) return null
    return data
  },
  async getAllConnections() {
    const client = getRedisClient()
    try {
      const ids = await client.smembers("connections:all")
      return Array.isArray(ids) ? ids : []
    } catch { return [] }
  },
  async updateConnectionStatus(connId: string, status: string, timestamp: number) {
    const client = getRedisClient()
    await client.hset(`connection:${connId}`, { status, updated_at: String(timestamp) })
  },
  async deleteConnection(connId: string) {
    const client = getRedisClient()
    await client.del(`connection:${connId}`)
    await client.srem("connections:all", connId)
  },
}

export const RedisTrades = {
  async createTrade(tradeId: string, data: Record<string, any>) {
    const client = getRedisClient()
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) flat[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
    await client.hset(`trade:${tradeId}`, flat)
    await client.sadd("trades:all", tradeId)
    if (data.connectionId) await client.sadd(`trades:connection:${data.connectionId}`, tradeId)
    return data
  },
  async getTrade(tradeId: string) {
    const client = getRedisClient()
    const data = await client.hgetall(`trade:${tradeId}`)
    if (!data || Object.keys(data).length === 0) return null
    return data
  },
  async updateTrade(tradeId: string, updates: Record<string, any>) {
    const client = getRedisClient()
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(updates)) flat[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
    flat.updated_at = String(Date.now())
    await client.hset(`trade:${tradeId}`, flat)
  },
  async getTradesByConnection(connId: string) {
    const client = getRedisClient()
    try {
      const ids = await client.smembers(`trades:connection:${connId}`)
      const trades = []
      if (Array.isArray(ids)) {
        for (const id of ids) {
          const t = await client.hgetall(`trade:${id}`)
          if (t && Object.keys(t).length > 0) trades.push(t)
        }
      }
      return trades
    } catch { return [] }
  },
}

export const RedisPositions = {
  async createPosition(posId: string, data: Record<string, any>) {
    const client = getRedisClient()
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) flat[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
    await client.hset(`position:${posId}`, flat)
    await client.sadd("positions:all", posId)
    if (data.connectionId) await client.sadd(`positions:connection:${data.connectionId}`, posId)
    return data
  },
  async getPosition(posId: string) {
    const client = getRedisClient()
    const data = await client.hgetall(`position:${posId}`)
    if (!data || Object.keys(data).length === 0) return null
    return data
  },
  async updatePosition(posId: string, updates: Record<string, any>) {
    const client = getRedisClient()
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(updates)) flat[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
    flat.updated_at = String(Date.now())
    await client.hset(`position:${posId}`, flat)
  },
  async getPositionsByConnection(connId: string) {
    const client = getRedisClient()
    try {
      const ids = await client.smembers(`positions:connection:${connId}`)
      const positions = []
      if (Array.isArray(ids)) {
        for (const id of ids) {
          const p = await client.hgetall(`position:${id}`)
          if (p && Object.keys(p).length > 0) positions.push(p)
        }
      }
      return positions
    } catch { return [] }
  },
  async getOpenPositions() {
    const client = getRedisClient()
    try {
      const ids = await client.smembers("positions:all")
      const positions = []
      if (Array.isArray(ids)) {
        for (const id of ids) {
          const p = await client.hgetall(`position:${id}`)
          if (p && Object.keys(p).length > 0 && p.status !== "closed") positions.push(p)
        }
      }
      return positions
    } catch { return [] }
  },
  async deletePosition(posId: string, connId?: string) {
    const client = getRedisClient()
    await client.del(`position:${posId}`)
    await client.srem("positions:all", posId)
    if (connId) await client.srem(`positions:connection:${connId}`, posId)
  },
}

export const RedisStrategies = {
  async getStrategiesByType(type: string) {
    const client = getRedisClient()
    try {
      const ids = await client.smembers(`strategies:type:${type}`)
      const strategies = []
      if (Array.isArray(ids)) {
        for (const id of ids) {
          const s = await client.hgetall(`strategy:${id}`)
          if (s && Object.keys(s).length > 0) strategies.push(s)
        }
      }
      return strategies
    } catch { return [] }
  },
}

export const RedisPresets = {
  async getPresetsByCategory(category: string) {
    const client = getRedisClient()
    try {
      const ids = await client.smembers(`presets:category:${category}`)
      const presets = []
      if (Array.isArray(ids)) {
        for (const id of ids) {
          const p = await client.hgetall(`preset:${id}`)
          if (p && Object.keys(p).length > 0) presets.push(p)
        }
      }
      return presets
    } catch { return [] }
  },
}

export const RedisMonitoring = {
  async logEvent(eventType: string, event: Record<string, any>) {
    const client = getRedisClient()
    try {
      await client.lpush(`logs:${eventType}`, JSON.stringify({ ...event, logged_at: Date.now() }))
      // Keep last 1000 entries
      await client.ltrim(`logs:${eventType}`, 0, 999)
    } catch (e) {
      console.warn("[v0] RedisMonitoring.logEvent failed:", e)
    }
  },
  async getEventLogs(eventType: string, limit: number = 100) {
    const client = getRedisClient()
    try {
      const logs = await client.lrange(`logs:${eventType}`, 0, limit - 1)
      return Array.isArray(logs)
        ? logs.map((log) => { try { return JSON.parse(log as string) } catch { return log } })
        : []
    } catch { return [] }
  },
}

export const RedisCache = {
  async set(key: string, value: any, ttlSeconds: number = 3600) {
    const client = getRedisClient()
    await client.set(`cache:${key}`, JSON.stringify(value))
    if (ttlSeconds > 0) await client.expire(`cache:${key}`, ttlSeconds)
  },
  async get(key: string) {
    const client = getRedisClient()
    const raw = await client.get(`cache:${key}`)
    if (raw === null || raw === undefined) return null
    try { return typeof raw === "string" ? JSON.parse(raw) : raw } catch { return raw }
  },
  async del(key: string) {
    const client = getRedisClient()
    await client.del(`cache:${key}`)
  },
}

export const RedisSettings = {
  async get(key: string) {
    const client = getRedisClient()
    const raw = await client.get(`settings:${key}`)
    if (raw === null || raw === undefined) return null
    try { return typeof raw === "string" ? JSON.parse(raw) : raw } catch { return raw }
  },
  async set(key: string, value: any) {
    const client = getRedisClient()
    await client.set(`settings:${key}`, JSON.stringify(value))
  },
  async del(key: string) {
    const client = getRedisClient()
    await client.del(`settings:${key}`)
  },
}

export const RedisBackup = {
  async createBackup(name: string) {
    const client = getRedisClient()
    const stats = await RedisBulkOps.getStatistics()
    const backup = { name, timestamp: Date.now(), stats }
    await client.set(`backup:${name}`, JSON.stringify(backup))
    await client.sadd("backups:all", name)
    return backup
  },
  async getBackup(name: string) {
    const client = getRedisClient()
    const raw = await client.get(`backup:${name}`)
    if (raw === null || raw === undefined) return null
    try { return typeof raw === "string" ? JSON.parse(raw) : raw } catch { return raw }
  },
  async listBackups() {
    const client = getRedisClient()
    try {
      const names = await client.smembers("backups:all")
      return Array.isArray(names) ? names : []
    } catch { return [] }
  },
}

export const RedisBulkOps = {
  async getStatistics() {
    const client = getRedisClient()
    try {
      const [users, connections, trades, positions, strategies, presets] = await Promise.all([
        client.scard("users:all").catch(() => 0),
        client.scard("connections:all").catch(() => 0),
        client.scard("trades:all").catch(() => 0),
        client.scard("positions:all").catch(() => 0),
        client.scard("strategies:all").catch(() => 0),
        client.scard("presets:all").catch(() => 0),
      ])
      return { users, connections, trades, positions, strategies, presets, timestamp: Date.now() }
    } catch { return { users: 0, connections: 0, trades: 0, positions: 0, strategies: 0, presets: 0, timestamp: Date.now() } }
  },
}
