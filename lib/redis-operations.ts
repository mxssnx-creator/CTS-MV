/**
 * Redis Operations Module - Complete system data operations with correct Upstash method names
 * All Redis methods use lowercase: hset, hgetall, smembers, sadd, srem, etc.
 */

import { getRedisClient } from "./redis-db"

// ============ POSITION OPERATIONS (Most commonly used) ============

export const RedisPositions = {
  async getPositionsByConnection(connId: string) {
    const client = getRedisClient()
    const posIds = await client.smembers(`positions:connection:${connId}`)
    const positions = []
    for (const id of posIds) {
      const pos = await client.hgetall(`position:${id}`)
      if (pos && Object.keys(pos).length > 0) positions.push(pos)
    }
    return positions
  },

  async getOpenPositions() {
    const client = getRedisClient()
    const posIds = await client.smembers("positions:all")
    const positions = []
    for (const id of posIds) {
      const pos = await client.hgetall(`position:${id}`)
      if (pos && Object.keys(pos).length > 0 && pos.status !== "closed") positions.push(pos)
    }
    return positions
  },

  async createPosition(posId: string, posData: any) {
    const client = getRedisClient()
    await client.hset(`position:${posId}`, posData)
    await client.sadd("positions:all", posId)
    await client.sadd(`positions:connection:${posData.connectionId}`, posId)
  },

  async getPosition(posId: string) {
    const client = getRedisClient()
    return await client.hgetall(`position:${posId}`)
  },

  async updatePosition(posId: string, updates: any) {
    const client = getRedisClient()
    await client.hset(`position:${posId}`, updates)
  },

  async closePosition(posId: string) {
    const client = getRedisClient()
    await client.hset(`position:${posId}`, { status: "closed", closedAt: Date.now() })
  },

  async getTotalPositionCount() {
    const client = getRedisClient()
    return await client.scard("positions:all")
  },
}

// All other operations use lowercase methods too
export const RedisTrades = {
  async getTradesByConnection(connId: string) {
    const client = getRedisClient()
    const tradeIds = await client.smembers(`trades:connection:${connId}`)
    const trades = []
    for (const id of tradeIds) {
      const trade = await client.hgetall(`trade:${id}`)
      if (trade && Object.keys(trade).length > 0) trades.push(trade)
    }
    return trades
  },
}
