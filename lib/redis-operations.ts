import { getRedisClient } from "./redis-db"

// ========== Connections ==========
export const RedisConnections = {
  async createConnection(conn: any) {
    const client = getRedisClient()
    const key = `connection:${conn.id}`
    await client.hset(key, {
      id: conn.id,
      name: conn.name,
      exchange: conn.exchange,
      api_key: conn.api_key || "",
      api_secret: conn.api_secret || "",
      is_enabled: conn.is_enabled ? "1" : "0",
      is_active: conn.is_active ? "1" : "0",
      created_at: new Date().toISOString(),
    })
    await client.sadd("connections:all", conn.id)
    return conn
  },

  async getConnection(id: string) {
    const client = getRedisClient()
    const data = await client.hgetall(`connection:${id}`)
    return data && Object.keys(data).length > 0 ? data : null
  },

  async getAllConnections() {
    const client = getRedisClient()
    const ids = (await client.smembers("connections:all")) || []
    const connections = []
    for (const id of ids) {
      const conn = await this.getConnection(id)
      if (conn) connections.push(conn)
    }
    return connections
  },
}

// ========== Trades ==========
export const RedisTrades = {
  async createTrade(connId: string, trade: any) {
    const client = getRedisClient()
    const key = `trade:${trade.id}`
    await client.hset(key, trade)
    await client.sadd(`trades:${connId}`, trade.id)
    await client.sadd("trades:all", trade.id)
    return trade
  },

  async getTrade(tradeId: string) {
    const client = getRedisClient()
    return await client.hgetall(`trade:${tradeId}`)
  },

  async getTradesByConnection(connId: string) {
    const client = getRedisClient()
    const tradeIds = (await client.smembers(`trades:${connId}`)) || []
    const trades = []
    for (const id of tradeIds) {
      const trade = await this.getTrade(id)
      if (trade) trades.push(trade)
    }
    return trades
  },
}

// ========== Positions ==========
export const RedisPositions = {
  async createPosition(connId: string, pos: any) {
    const client = getRedisClient()
    const key = `position:${pos.id}`
    await client.hset(key, pos)
    await client.sadd(`positions:${connId}`, pos.id)
    await client.sadd("positions:all", pos.id)
    return pos
  },

  async getPosition(posId: string) {
    const client = getRedisClient()
    return await client.hgetall(`position:${posId}`)
  },

  async getPositionsByConnection(connId: string) {
    const client = getRedisClient()
    const posIds = (await client.smembers(`positions:${connId}`)) || []
    const positions = []
    for (const id of posIds) {
      const pos = await this.getPosition(id)
      if (pos) positions.push(pos)
    }
    return positions
  },
}

// ========== Cache ==========
export const RedisCache = {
  async set(key: string, value: any, ttl?: number) {
    const client = getRedisClient()
    await client.set(`cache:${key}`, JSON.stringify(value))
    if (ttl) await client.expire(`cache:${key}`, ttl)
  },

  async get(key: string) {
    const client = getRedisClient()
    const data = await client.get(`cache:${key}`)
    return data ? JSON.parse(data) : null
  },
}

// ========== Settings ==========
export const RedisSettings = {
  async set(key: string, value: any) {
    const client = getRedisClient()
    await client.set(`settings:${key}`, JSON.stringify(value))
  },

  async get(key: string) {
    const client = getRedisClient()
    const data = await client.get(`settings:${key}`)
    return data ? JSON.parse(data) : null
  },
}

// ========== Monitoring ==========
export const RedisMonitoring = {
  async recordEvent(event: any) {
    const client = getRedisClient()
    const eventId = `event:${Date.now()}`
    await client.hset(eventId, event)
    await client.sadd("monitoring:events", eventId)
    await client.expire(eventId, 2592000) // 30 days
  },

  async getStatistics() {
    const client = getRedisClient()
    const [connectionsCount, tradesCount, positionsCount] = await Promise.all([
      client.scard("connections:all").catch(() => 0),
      client.scard("trades:all").catch(() => 0),
      client.scard("positions:all").catch(() => 0),
    ])
    return {
      connections: connectionsCount,
      trades: tradesCount,
      positions: positionsCount,
      timestamp: Date.now(),
    }
  },
}

// ========== Backup ==========
export const RedisBackup = {
  async createSnapshot(name: string) {
    const client = getRedisClient()
    const snapshotId = `snapshot:${Date.now()}`
    await client.hset(snapshotId, {
      id: snapshotId,
      name,
      created_at: new Date().toISOString(),
      status: "completed",
    })
    await client.sadd("snapshots:all", snapshotId)
    return snapshotId
  },

  async listSnapshots() {
    const client = getRedisClient()
    const snapshotIds = (await client.smembers("snapshots:all")) || []
    const snapshots = []
    for (const id of snapshotIds) {
      const snapshot = await client.hgetall(id)
      if (snapshot) snapshots.push(snapshot)
    }
    return snapshots
  },
}
