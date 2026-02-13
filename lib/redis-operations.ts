/**
 * Redis Operations Module - Complete system data operations with lowercase Upstash methods
 * All Redis method calls use lowercase (hset, hgetall, smembers, sadd, etc.)
 */

import { getRedisClient } from "./redis-db"

// Stub implementations that use the correct lowercase Upstash methods
export const RedisUsers = {
  async getAllUsers() {
    const client = getRedisClient()
    try {
      const userIds = await client.smembers("users:all")
      return Array.isArray(userIds) ? userIds : []
    } catch (e) {
      return []
    }
  },
}

export const RedisConnections = {
  async getAllConnections() {
    const client = getRedisClient()
    try {
      const connIds = await client.smembers("connections:all")
      return Array.isArray(connIds) ? connIds : []
    } catch (e) {
      return []
    }
  },
}

export const RedisTrades = {
  async getTradesByConnection(connId: string) {
    const client = getRedisClient()
    try {
      const tradeIds = await client.smembers(`trades:connection:${connId}`)
      const trades = []
      if (Array.isArray(tradeIds)) {
        for (const id of tradeIds) {
          const trade = await client.hgetall(`trade:${id}`)
          if (trade && Object.keys(trade).length > 0) trades.push(trade)
        }
      }
      return trades
    } catch (e) {
      return []
    }
  },
}

export const RedisPositions = {
  async getPositionsByConnection(connId: string) {
    const client = getRedisClient()
    try {
      const posIds = await client.smembers(`positions:connection:${connId}`)
      const positions = []
      if (Array.isArray(posIds)) {
        for (const id of posIds) {
          const pos = await client.hgetall(`position:${id}`)
          if (pos && Object.keys(pos).length > 0) positions.push(pos)
        }
      }
      return positions
    } catch (e) {
      return []
    }
  },

  async getOpenPositions() {
    const client = getRedisClient()
    try {
      const posIds = await client.smembers("positions:all")
      const positions = []
      if (Array.isArray(posIds)) {
        for (const id of posIds) {
          const pos = await client.hgetall(`position:${id}`)
          if (pos && Object.keys(pos).length > 0 && pos.status !== "closed") {
            positions.push(pos)
          }
        }
      }
      return positions
    } catch (e) {
      return []
    }
  },
}

export const RedisStrategies = {
  async getStrategiesByType(type: string) {
    const client = getRedisClient()
    try {
      const stratIds = await client.smembers(`strategies:type:${type}`)
      const strategies = []
      if (Array.isArray(stratIds)) {
        for (const id of stratIds) {
          const strat = await client.hgetall(`strategy:${id}`)
          if (strat && Object.keys(strat).length > 0) strategies.push(strat)
        }
      }
      return strategies
    } catch (e) {
      return []
    }
  },
}

export const RedisPresets = {
  async getPresetsByCategory(category: string) {
    const client = getRedisClient()
    try {
      const presetIds = await client.smembers(`presets:category:${category}`)
      const presets = []
      if (Array.isArray(presetIds)) {
        for (const id of presetIds) {
          const preset = await client.hgetall(`preset:${id}`)
          if (preset && Object.keys(preset).length > 0) presets.push(preset)
        }
      }
      return presets
    } catch (e) {
      return []
    }
  },
}

export const RedisMonitoring = {
  async getEventLogs(eventType: string, limit: number = 100) {
    const client = getRedisClient()
    try {
      const logs = await client.lrange(`logs:${eventType}`, 0, limit - 1)
      return Array.isArray(logs) ? logs.map((log) => JSON.parse(log as string)) : []
    } catch (e) {
      return []
    }
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
      return { users, connections, trades, positions, strategies, presets }
    } catch (e) {
      return { users: 0, connections: 0, trades: 0, positions: 0, strategies: 0, presets: 0 }
    }
  },
}
