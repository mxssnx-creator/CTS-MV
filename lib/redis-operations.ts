/**
 * Redis Operations Module - Complete system data operations
 * Provides CRUD operations for all system entities: users, connections, trades, positions, strategies, presets, monitoring
 */

import { getRedisClient } from "./redis-db"

// ============ USER OPERATIONS ============

export const RedisUsers = {
  async createUser(userId: number, userData: any) {
    const client = getRedisClient()
    await client.hSet(`users:${userId}`, userData)
    await client.sAdd("users:all", userId)
  },

  async getUser(userId: number) {
    const client = getRedisClient()
    return await client.hGetAll(`users:${userId}`)
  },

  async updateUser(userId: number, updates: any) {
    const client = getRedisClient()
    await client.hSet(`users:${userId}`, updates)
  },

  async deleteUser(userId: number) {
    const client = getRedisClient()
    await client.del(`users:${userId}`)
    await client.sRem("users:all", userId)
  },

  async getAllUsers() {
    const client = getRedisClient()
    const userIds = await client.sMembers("users:all")
    const users = []
    for (const id of userIds) {
      const user = await client.hGetAll(`users:${id}`)
      if (user && Object.keys(user).length > 0) users.push(user)
    }
    return users
  },

  async setUserSession(userId: number, token: string, expiry: number = 86400) {
    const client = getRedisClient()
    await client.setEx(`session:${userId}`, expiry, token)
  },

  async getUserSession(userId: number) {
    const client = getRedisClient()
    return await client.get(`session:${userId}`)
  },
}

// ============ CONNECTION OPERATIONS ============

export const RedisConnections = {
  async createConnection(connId: string, connData: any) {
    const client = getRedisClient()
    await client.hSet(`connection:${connId}`, connData)
    await client.sAdd("connections:all", connId)
    await client.sAdd(`connections:by_exchange:${connData.exchange}`, connId)
  },

  async getConnection(connId: string) {
    const client = getRedisClient()
    return await client.hGetAll(`connection:${connId}`)
  },

  async updateConnectionStatus(connId: string, status: string, timestamp: number) {
    const client = getRedisClient()
    await client.hSet(`connection:${connId}`, { status, lastUpdated: timestamp })
    await client.zAdd("connection:status_index", { score: timestamp, member: connId })
  },

  async getAllConnections() {
    const client = getRedisClient()
    const connIds = await client.sMembers("connections:all")
    const connections = []
    for (const id of connIds) {
      const conn = await client.hGetAll(`connection:${id}`)
      if (conn && Object.keys(conn).length > 0) connections.push(conn)
    }
    return connections
  },

  async getConnectionsByExchange(exchange: string) {
    const client = getRedisClient()
    const connIds = await client.sMembers(`connections:by_exchange:${exchange}`)
    const connections = []
    for (const id of connIds) {
      const conn = await client.hGetAll(`connection:${id}`)
      if (conn && Object.keys(conn).length > 0) connections.push(conn)
    }
    return connections
  },

  async recordApiCall(connId: string, count: number = 1) {
    const client = getRedisClient()
    await client.incr(`rate_limit:${connId}`)
    await client.expire(`rate_limit:${connId}`, 3600)
  },

  async getApiCallCount(connId: string) {
    const client = getRedisClient()
    const count = await client.get(`rate_limit:${connId}`)
    return parseInt(count || "0", 10)
  },
}

// ============ TRADE OPERATIONS ============

export const RedisTrades = {
  async createTrade(tradeId: string, tradeData: any) {
    const client = getRedisClient()
    await client.hSet(`trade:${tradeId}`, tradeData)
    await client.sAdd("trades:all", tradeId)
    await client.zAdd("trades:by_time", { score: tradeData.timestamp || Date.now(), member: tradeId })
  },

  async getTrade(tradeId: string) {
    const client = getRedisClient()
    return await client.hGetAll(`trade:${tradeId}`)
  },

  async updateTrade(tradeId: string, updates: any) {
    const client = getRedisClient()
    await client.hSet(`trade:${tradeId}`, updates)
  },

  async getTradesByTimeRange(startTime: number, endTime: number) {
    const client = getRedisClient()
    const tradeIds = await client.zRangeByScore("trades:by_time", startTime, endTime)
    const trades = []
    for (const id of tradeIds) {
      const trade = await client.hGetAll(`trade:${id}`)
      if (trade && Object.keys(trade).length > 0) trades.push(trade)
    }
    return trades
  },

  async getTradesByConnection(connId: string) {
    const client = getRedisClient()
    const tradeIds = await client.sMembers(`trades:connection:${connId}`)
    const trades = []
    for (const id of tradeIds) {
      const trade = await client.hGetAll(`trade:${id}`)
      if (trade && Object.keys(trade).length > 0) trades.push(trade)
    }
    return trades
  },

  async incrementTradeCounter() {
    const client = getRedisClient()
    return await client.incr("counters:trades")
  },
}

// ============ POSITION OPERATIONS ============

export const RedisPositions = {
  async createPosition(posId: string, posData: any) {
    const client = getRedisClient()
    await client.hSet(`position:${posId}`, posData)
    await client.sAdd("positions:all", posId)
    await client.sAdd(`positions:connection:${posData.connectionId}`, posId)
  },

  async getPosition(posId: string) {
    const client = getRedisClient()
    return await client.hGetAll(`position:${posId}`)
  },

  async updatePosition(posId: string, updates: any) {
    const client = getRedisClient()
    await client.hSet(`position:${posId}`, updates)
  },

  async closePosition(posId: string) {
    const client = getRedisClient()
    await client.hSet(`position:${posId}`, { status: "closed", closedAt: Date.now() })
  },

  async getOpenPositions() {
    const client = getRedisClient()
    const posIds = await client.sMembers("positions:all")
    const positions = []
    for (const id of posIds) {
      const pos = await client.hGetAll(`position:${id}`)
      if (pos && Object.keys(pos).length > 0 && pos.status !== "closed") positions.push(pos)
    }
    return positions
  },

  async getPositionsByConnection(connId: string) {
    const client = getRedisClient()
    const posIds = await client.sMembers(`positions:connection:${connId}`)
    const positions = []
    for (const id of posIds) {
      const pos = await client.hGetAll(`position:${id}`)
      if (pos && Object.keys(pos).length > 0) positions.push(pos)
    }
    return positions
  },

  async getTotalPositionCount() {
    const client = getRedisClient()
    return await client.sCard("positions:all")
  },
}

// ============ STRATEGY OPERATIONS ============

export const RedisStrategies = {
  async createStrategy(stratId: string, stratData: any) {
    const client = getRedisClient()
    await client.hSet(`strategy:${stratId}`, stratData)
    await client.sAdd("strategies:all", stratId)
    await client.sAdd(`strategies:type:${stratData.type}`, stratId)
  },

  async getStrategy(stratId: string) {
    const client = getRedisClient()
    return await client.hGetAll(`strategy:${stratId}`)
  },

  async updateStrategy(stratId: string, updates: any) {
    const client = getRedisClient()
    await client.hSet(`strategy:${stratId}`, updates)
  },

  async getStrategiesByType(type: string) {
    const client = getRedisClient()
    const stratIds = await client.sMembers(`strategies:type:${type}`)
    const strategies = []
    for (const id of stratIds) {
      const strat = await client.hGetAll(`strategy:${id}`)
      if (strat && Object.keys(strat).length > 0) strategies.push(strat)
    }
    return strategies
  },

  async recordStrategyPerformance(stratId: string, winRate: number, profitLoss: number) {
    const client = getRedisClient()
    await client.hSet(`strategy:performance:${stratId}`, { winRate, profitLoss, updatedAt: Date.now() })
  },

  async getStrategyPerformance(stratId: string) {
    const client = getRedisClient()
    return await client.hGetAll(`strategy:performance:${stratId}`)
  },
}

// ============ PRESET OPERATIONS ============

export const RedisPresets = {
  async createPreset(presetId: string, presetData: any) {
    const client = getRedisClient()
    await client.hSet(`preset:${presetId}`, presetData)
    await client.sAdd("presets:all", presetId)
    await client.sAdd(`presets:category:${presetData.category}`, presetId)
  },

  async getPreset(presetId: string) {
    const client = getRedisClient()
    return await client.hGetAll(`preset:${presetId}`)
  },

  async updatePreset(presetId: string, updates: any) {
    const client = getRedisClient()
    await client.hSet(`preset:${presetId}`, updates)
  },

  async getPresetsByCategory(category: string) {
    const client = getRedisClient()
    const presetIds = await client.sMembers(`presets:category:${category}`)
    const presets = []
    for (const id of presetIds) {
      const preset = await client.hGetAll(`preset:${id}`)
      if (preset && Object.keys(preset).length > 0) presets.push(preset)
    }
    return presets
  },

  async duplicatePreset(presetId: string, newPresetId: string) {
    const client = getRedisClient()
    const preset = await client.hGetAll(`preset:${presetId}`)
    if (preset && Object.keys(preset).length > 0) {
      await client.hSet(`preset:${newPresetId}`, preset)
      await client.sAdd("presets:all", newPresetId)
      const category = preset.category as string
      await client.sAdd(`presets:category:${category}`, newPresetId)
    }
  },
}

// ============ MONITORING & LOGGING OPERATIONS ============

export const RedisMonitoring = {
  async recordSystemHealth(metric: string, value: number) {
    const client = getRedisClient()
    const timestamp = Date.now()
    await client.zAdd(`monitoring:${metric}`, { score: timestamp, member: `${value}` })
    await client.expire(`monitoring:${metric}`, 604800) // 7 days TTL
  },

  async getSystemMetrics(metric: string, timeWindowMs: number = 3600000) {
    const client = getRedisClient()
    const startTime = Date.now() - timeWindowMs
    return await client.zRangeByScore(`monitoring:${metric}`, startTime, Date.now())
  },

  async logEvent(eventType: string, eventData: any) {
    const client = getRedisClient()
    const timestamp = Date.now()
    await client.lPush(`logs:${eventType}`, JSON.stringify({ ...eventData, timestamp }))
    await client.lTrim(`logs:${eventType}`, 0, 9999) // Keep last 10k events
    await client.expire(`logs:${eventType}`, 604800) // 7 days TTL
  },

  async getEventLogs(eventType: string, limit: number = 100) {
    const client = getRedisClient()
    const logs = await client.lRange(`logs:${eventType}`, 0, limit - 1)
    return logs.map((log) => JSON.parse(log))
  },

  async recordErrorEvent(error: string, context: any) {
    const client = getRedisClient()
    await client.lPush("logs:errors", JSON.stringify({ error, context, timestamp: Date.now() }))
    await client.lTrim("logs:errors", 0, 9999)
    await client.expire("logs:errors", 604800)
  },
}

// ============ CACHE OPERATIONS ============

export const RedisCache = {
  async setCacheData(key: string, value: any, ttlSeconds: number = 3600) {
    const client = getRedisClient()
    await client.setEx(key, ttlSeconds, JSON.stringify(value))
  },

  async getCacheData(key: string) {
    const client = getRedisClient()
    const data = await client.get(key)
    return data ? JSON.parse(data) : null
  },

  async deleteCacheData(key: string) {
    const client = getRedisClient()
    await client.del(key)
  },

  async recordCacheHit(key: string) {
    const client = getRedisClient()
    await client.incr(`cache:hits:${key}`)
    await client.expire(`cache:hits:${key}`, 3600)
  },

  async recordCacheMiss(key: string) {
    const client = getRedisClient()
    await client.incr(`cache:misses:${key}`)
    await client.expire(`cache:misses:${key}`, 3600)
  },

  async clearAllCache() {
    const client = getRedisClient()
    // Get all cache keys and delete them
    const pattern = "cache:*"
    const keys = await client.keys(pattern)
    for (const key of keys) {
      await client.del(key)
    }
  },
}

// ============ SETTINGS & CONFIGURATION OPERATIONS ============

export const RedisSettings = {
  async setSetting(settingKey: string, value: any) {
    const client = getRedisClient()
    await client.hSet("system:settings", { [settingKey]: JSON.stringify(value) })
  },

  async getSetting(settingKey: string) {
    const client = getRedisClient()
    const value = await client.hGet("system:settings", settingKey)
    return value ? JSON.parse(value) : null
  },

  async getAllSettings() {
    const client = getRedisClient()
    const settings = await client.hGetAll("system:settings")
    const parsed: any = {}
    for (const [key, value] of Object.entries(settings)) {
      parsed[key] = JSON.parse(value as string)
    }
    return parsed
  },

  async setFeatureFlag(flagName: string, enabled: boolean) {
    const client = getRedisClient()
    await client.hSet("system:feature_flags", { [flagName]: enabled ? "1" : "0" })
  },

  async getFeatureFlag(flagName: string) {
    const client = getRedisClient()
    const flag = await client.hGet("system:feature_flags", flagName)
    return flag === "1"
  },

  async setThreshold(thresholdName: string, value: number) {
    const client = getRedisClient()
    await client.hSet("system:thresholds", { [thresholdName]: value })
  },

  async getThreshold(thresholdName: string) {
    const client = getRedisClient()
    const value = await client.hGet("system:thresholds", thresholdName)
    return value ? parseFloat(value) : 0
  },
}

// ============ BACKUP & RECOVERY OPERATIONS ============

export const RedisBackup = {
  async createSnapshot(snapshotId: string, snapshotData: any) {
    const client = getRedisClient()
    await client.hSet(`snapshot:${snapshotId}`, {
      ...snapshotData,
      createdAt: Date.now(),
    })
    await client.sAdd("snapshots:all", snapshotId)
  },

  async getSnapshot(snapshotId: string) {
    const client = getRedisClient()
    return await client.hGetAll(`snapshot:${snapshotId}`)
  },

  async listSnapshots() {
    const client = getRedisClient()
    const snapshotIds = await client.sMembers("snapshots:all")
    const snapshots = []
    for (const id of snapshotIds) {
      const snapshot = await client.hGetAll(`snapshot:${id}`)
      if (snapshot && Object.keys(snapshot).length > 0) snapshots.push(snapshot)
    }
    return snapshots
  },

  async recordRecoveryPoint(recoveryId: string, recoveryData: any) {
    const client = getRedisClient()
    await client.hSet(`recovery:${recoveryId}`, {
      ...recoveryData,
      timestamp: Date.now(),
    })
    await client.lPush("recovery:history", recoveryId)
    await client.lTrim("recovery:history", 0, 99) // Keep last 100 recovery points
  },

  async getLatestRecoveryPoint() {
    const client = getRedisClient()
    const recoveryIds = await client.lRange("recovery:history", 0, 0)
    if (recoveryIds.length > 0) {
      return await client.hGetAll(`recovery:${recoveryIds[0]}`)
    }
    return null
  },
}

// ============ BULK OPERATIONS ============

export const RedisBulkOps = {
  async deleteAllData() {
    const client = getRedisClient()
    await client.flushDb()
  },

  async exportAllData() {
    const client = getRedisClient()
    const keys = await client.keys("*")
    const data: any = {}
    for (const key of keys) {
      const type = await client.type(key)
      if (type === "hash") {
        data[key] = await client.hGetAll(key)
      } else if (type === "set") {
        data[key] = await client.sMembers(key)
      } else if (type === "list") {
        data[key] = await client.lRange(key, 0, -1)
      } else if (type === "zset") {
        data[key] = await client.zRangeWithScores(key, 0, -1)
      } else if (type === "string") {
        data[key] = await client.get(key)
      }
    }
    return data
  },

  async getStatistics() {
    return {
      users: await getRedisClient().sCard("users:all"),
      connections: await getRedisClient().sCard("connections:all"),
      trades: await getRedisClient().sCard("trades:all"),
      positions: await getRedisClient().sCard("positions:all"),
      strategies: await getRedisClient().sCard("strategies:all"),
      presets: await getRedisClient().sCard("presets:all"),
    }
  },
}
