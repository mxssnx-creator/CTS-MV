import { getRedisClient } from "./redis-db"

export const RedisConnections = {
  async create(connection: any) {
    const client = getRedisClient()
    const key = `connection:${connection.id}`
    const data = {
      id: connection.id,
      name: connection.name,
      exchange: connection.exchange,
      api_key: connection.api_key || "",
      api_secret: connection.api_secret || "",
      api_type: connection.api_type || "spot",
      is_enabled: connection.is_enabled ? "1" : "0",
      is_active: connection.is_active ? "1" : "0",
      created_at: connection.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await (client as any).hset(key, data)
    await (client as any).sadd("connections", connection.id)
  },

  async get(id: string) {
    const client = getRedisClient()
    return await (client as any).hgetall(`connection:${id}`)
  },

  async getAll() {
    const client = getRedisClient()
    const ids = await (client as any).smembers("connections")
    const connections = []
    for (const id of ids || []) {
      const conn = await (client as any).hgetall(`connection:${id}`)
      if (conn && Object.keys(conn).length > 0) connections.push(conn)
    }
    return connections
  },

  async update(id: string, updates: any) {
    const client = getRedisClient()
    const key = `connection:${id}`
    const existing = await (client as any).hgetall(key)
    if (!existing) throw new Error(`Connection ${id} not found`)
    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
    await (client as any).hset(key, updated)
  },

  async delete(id: string) {
    const client = getRedisClient()
    await (client as any).del(`connection:${id}`)
    await (client as any).srem("connections", id)
  },
}

export const RedisTrades = {
  async create(connectionId: string, trade: any) {
    const client = getRedisClient()
    const key = `trade:${trade.id}`
    const data = {
      id: trade.id,
      connection_id: connectionId,
      symbol: trade.symbol,
      side: trade.side,
      quantity: String(trade.quantity),
      entry_price: String(trade.entry_price),
      status: trade.status || "open",
      created_at: trade.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await (client as any).hset(key, data)
    await (client as any).sadd(`trades:${connectionId}`, trade.id)
  },

  async get(tradeId: string) {
    const client = getRedisClient()
    return await (client as any).hgetall(`trade:${tradeId}`)
  },

  async getByConnection(connectionId: string) {
    const client = getRedisClient()
    const tradeIds = await (client as any).smembers(`trades:${connectionId}`)
    const trades = []
    for (const id of tradeIds || []) {
      const trade = await (client as any).hgetall(`trade:${id}`)
      if (trade && Object.keys(trade).length > 0) trades.push(trade)
    }
    return trades
  },

  async update(tradeId: string, updates: any) {
    const client = getRedisClient()
    const key = `trade:${tradeId}`
    const existing = await (client as any).hgetall(key)
    if (!existing) throw new Error(`Trade ${tradeId} not found`)
    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
    await (client as any).hset(key, updated)
  },
}

export const RedisPositions = {
  async create(connectionId: string, position: any) {
    const client = getRedisClient()
    const key = `position:${position.id}`
    const data = {
      id: position.id,
      connection_id: connectionId,
      symbol: position.symbol,
      quantity: String(position.quantity),
      entry_price: String(position.entry_price),
      current_price: String(position.current_price || position.entry_price),
      status: position.status || "open",
      created_at: position.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await (client as any).hset(key, data)
    await (client as any).sadd(`positions:${connectionId}`, position.id)
  },

  async get(positionId: string) {
    const client = getRedisClient()
    return await (client as any).hgetall(`position:${positionId}`)
  },

  async getByConnection(connectionId: string) {
    const client = getRedisClient()
    const posIds = await (client as any).smembers(`positions:${connectionId}`)
    const positions = []
    for (const id of posIds || []) {
      const pos = await (client as any).hgetall(`position:${id}`)
      if (pos && Object.keys(pos).length > 0) positions.push(pos)
    }
    return positions
  },

  async update(positionId: string, updates: any) {
    const client = getRedisClient()
    const key = `position:${positionId}`
    const existing = await (client as any).hgetall(key)
    if (!existing) throw new Error(`Position ${positionId} not found`)
    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
    await (client as any).hset(key, updated)
  },

  async delete(connectionId: string, positionId: string) {
    const client = getRedisClient()
    await (client as any).del(`position:${positionId}`)
    await (client as any).srem(`positions:${connectionId}`, positionId)
  },
}

export const RedisCache = {
  async set(key: string, value: any, ttl?: number) {
    const client = getRedisClient()
    await (client as any).set(`cache:${key}`, JSON.stringify(value))
    if (ttl) await (client as any).expire(`cache:${key}`, ttl)
  },

  async get(key: string) {
    const client = getRedisClient()
    const value = await (client as any).get(`cache:${key}`)
    return value ? JSON.parse(value) : null
  },
}

export const RedisBulkOps = {
  async getStatistics() {
    const client = getRedisClient()
    const [connectionsCount, positionsCount, tradesCount] = await Promise.all([
      (client as any).scard("connections").catch(() => 0),
      (client as any).scard("positions:all").catch(() => 0),
      (client as any).scard("trades:all").catch(() => 0),
    ])
    return {
      connections: connectionsCount,
      positions: positionsCount,
      trades: tradesCount,
      timestamp: Date.now(),
    }
  },
}

export const RedisSettings = {
  async set(key: string, value: any) {
    const client = getRedisClient()
    await (client as any).set(`settings:${key}`, JSON.stringify(value))
  },

  async get(key: string) {
    const client = getRedisClient()
    const value = await (client as any).get(`settings:${key}`)
    return value ? JSON.parse(value) : null
  },

  async getAll() {
    const client = getRedisClient()
    const keys = await (client as any).keys("settings:*")
    const result: Record<string, any> = {}
    for (const k of keys || []) {
      const val = await (client as any).get(k)
      result[k.replace("settings:", "")] = val ? JSON.parse(val) : null
    }
    return result
  },
}

export const RedisMonitoring = {
  async recordMetric(name: string, value: number) {
    const client = getRedisClient()
    await (client as any).sadd(`metrics:${name}`, JSON.stringify({ value, timestamp: Date.now() }))
  },

  async getMetrics(name: string, limit: number = 100) {
    const client = getRedisClient()
    const data = await (client as any).smembers(`metrics:${name}`)
    return (data || []).slice(0, limit).map(d => JSON.parse(d))
  },
}

export const RedisBackup = {
  async createSnapshot() {
    const client = getRedisClient()
    const timestamp = Date.now()
    const key = `backup:${timestamp}`
    const allKeys = await (client as any).keys("*")
    const snapshot = { timestamp, keys_count: allKeys ? allKeys.length : 0 }
    await (client as any).hset(key, snapshot)
    await (client as any).sadd("backups", timestamp)
    return snapshot
  },

  async listSnapshots() {
    const client = getRedisClient()
    const timestamps = await (client as any).smembers("backups")
    return timestamps || []
  },
}
