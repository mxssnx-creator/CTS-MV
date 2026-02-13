import { getRedisClient } from "./redis-db"

export const RedisConnections = {
  async createConnection(connection: any) {
    const client = getRedisClient()
    const key = `connection:${connection.id}`
    await client.hset(key, connection)
    await client.sadd("connections", connection.id)
  },

  async getConnection(connectionId: string) {
    const client = getRedisClient()
    const key = `connection:${connectionId}`
    return await client.hgetall(key)
  },

  async getAllConnections() {
    const client = getRedisClient()
    const connectionIds = await client.smembers("connections")
    const connections = []
    for (const id of connectionIds) {
      const conn = await this.getConnection(id)
      if (conn && Object.keys(conn).length > 0) {
        connections.push(conn)
      }
    }
    return connections
  },

  async updateConnection(connectionId: string, updates: any) {
    const client = getRedisClient()
    const key = `connection:${connectionId}`
    const current = await this.getConnection(connectionId)
    if (!current) throw new Error(`Connection ${connectionId} not found`)
    const updated = { ...current, ...updates, updated_at: new Date().toISOString() }
    await client.hset(key, updated)
  },

  async deleteConnection(connectionId: string) {
    const client = getRedisClient()
    const key = `connection:${connectionId}`
    await client.del(key)
    await client.srem("connections", connectionId)
  },
}

export const RedisTrades = {
  async createTrade(connectionId: string, trade: any) {
    const client = getRedisClient()
    const key = `trade:${trade.id}`
    await client.hset(key, trade)
    await client.sadd(`trades:${connectionId}`, trade.id)
    await client.sadd("trades:all", trade.id)
  },

  async getTrade(tradeId: string) {
    const client = getRedisClient()
    return await client.hgetall(`trade:${tradeId}`)
  },

  async getTradesByConnection(connectionId: string) {
    const client = getRedisClient()
    const tradeIds = await client.smembers(`trades:${connectionId}`)
    const trades = []
    for (const id of tradeIds) {
      const trade = await this.getTrade(id)
      if (trade && Object.keys(trade).length > 0) {
        trades.push(trade)
      }
    }
    return trades
  },

  async updateTrade(tradeId: string, updates: any) {
    const client = getRedisClient()
    const current = await this.getTrade(tradeId)
    if (!current) throw new Error(`Trade ${tradeId} not found`)
    const updated = { ...current, ...updates, updated_at: new Date().toISOString() }
    await client.hset(`trade:${tradeId}`, updated)
  },
}

export const RedisPositions = {
  async createPosition(connectionId: string, position: any) {
    const client = getRedisClient()
    const key = `position:${position.id}`
    await client.hset(key, position)
    await client.sadd(`positions:${connectionId}`, position.id)
    await client.sadd("positions:all", position.id)
  },

  async getPosition(positionId: string) {
    const client = getRedisClient()
    return await client.hgetall(`position:${positionId}`)
  },

  async getPositionsByConnection(connectionId: string) {
    const client = getRedisClient()
    const posIds = await client.smembers(`positions:${connectionId}`)
    const positions = []
    for (const id of posIds) {
      const pos = await this.getPosition(id)
      if (pos && Object.keys(pos).length > 0) {
        positions.push(pos)
      }
    }
    return positions
  },

  async updatePosition(positionId: string, updates: any) {
    const client = getRedisClient()
    const current = await this.getPosition(positionId)
    if (!current) throw new Error(`Position ${positionId} not found`)
    const updated = { ...current, ...updates, updated_at: new Date().toISOString() }
    await client.hset(`position:${positionId}`, updated)
  },

  async deletePosition(positionId: string) {
    const client = getRedisClient()
    await client.del(`position:${positionId}`)
  },
}

export const RedisCache = {
  async set(key: string, value: any, ttl?: number) {
    const client = getRedisClient()
    await client.set(`cache:${key}`, JSON.stringify(value))
    if (ttl) {
      await client.expire(`cache:${key}`, ttl)
    }
  },

  async get(key: string) {
    const client = getRedisClient()
    const value = await client.get(`cache:${key}`)
    return value ? JSON.parse(value) : null
  },

  async delete(key: string) {
    const client = getRedisClient()
    await client.del(`cache:${key}`)
  },
}

export const RedisSettings = {
  async set(key: string, value: any) {
    const client = getRedisClient()
    await client.set(`settings:${key}`, JSON.stringify(value))
  },

  async get(key: string) {
    const client = getRedisClient()
    const value = await client.get(`settings:${key}`)
    return value ? JSON.parse(value) : null
  },

  async getAll() {
    const client = getRedisClient()
    // Get all settings keys
    const keys = await client.keys("settings:*")
    const settings: Record<string, any> = {}
    for (const key of keys) {
      const keyName = key.replace("settings:", "")
      settings[keyName] = await this.get(keyName)
    }
    return settings
  },
}

export const RedisMonitoring = {
  async recordEvent(event: string, data: any) {
    const client = getRedisClient()
    const eventId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const eventKey = `event:${eventId}`
    await client.hset(eventKey, {
      id: eventId,
      event,
      timestamp: new Date().toISOString(),
      ...data,
    })
    await client.sadd("events:all", eventId)
    // Keep only 10000 events
    const count = await client.scard("events:all")
    if (count > 10000) {
      const oldestEvents = (await client.smembers("events:all")) || []
      for (const id of oldestEvents.slice(0, 100)) {
        await client.del(`event:${id}`)
        await client.srem("events:all", id)
      }
    }
  },

  async getStatistics() {
    const client = getRedisClient()
    const [connectionsCount, tradesCount, positionsCount] = await Promise.all([
      client.scard("connections").catch(() => 0),
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

export const RedisBackup = {
  async createSnapshot(name: string) {
    const client = getRedisClient()
    const snapshotId = `snapshot:${Date.now()}`
    const connections = await RedisConnections.getAllConnections()
    await client.hset(snapshotId, {
      name,
      timestamp: new Date().toISOString(),
      data: JSON.stringify(connections),
    })
    await client.sadd("snapshots", snapshotId)
  },

  async listSnapshots() {
    const client = getRedisClient()
    const snapshotIds = await client.smembers("snapshots")
    const snapshots = []
    for (const id of snapshotIds) {
      const snap = await client.hgetall(id)
      if (snap && Object.keys(snap).length > 0) {
        snapshots.push(snap)
      }
    }
    return snapshots
  },
}
