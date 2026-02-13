/**
 * Redis Service Layer - High-level business logic using Redis operations
 * Only calls methods that actually exist on the Redis operation modules
 */

import {
  RedisUsers,
  RedisConnections,
  RedisTrades,
  RedisPositions,
  RedisMonitoring,
  RedisCache,
  RedisSettings,
  RedisBackup,
  RedisBulkOps,
} from "./redis-operations"

export class RedisService {
  // User Management
  static async createNewUser(userId: number, email: string, username: string) {
    await RedisUsers.createUser(userId, {
      id: userId,
      email,
      username,
      createdAt: Date.now(),
      role: "user",
    })
  }

  // Connection Management
  static async registerConnection(
    connId: string,
    exchange: string,
    apiKey: string,
    apiSecret: string,
    apiPassphrase?: string
  ) {
    await RedisConnections.createConnection(connId, {
      id: connId,
      exchange,
      apiKey,
      apiSecret,
      apiPassphrase: apiPassphrase || "",
      status: "connected",
      createdAt: Date.now(),
    })
    await RedisMonitoring.logEvent("connection_created", { connId, exchange })
  }

  static async updateConnectionHealth(connId: string, isHealthy: boolean) {
    const status = isHealthy ? "healthy" : "unhealthy"
    await RedisConnections.updateConnectionStatus(connId, status, Date.now())
  }

  // Trade Management
  static async executeNewTrade(
    connId: string,
    symbol: string,
    side: "buy" | "sell",
    quantity: number,
    price: number
  ) {
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await RedisTrades.createTrade(tradeId, {
      id: tradeId,
      connectionId: connId,
      symbol,
      side,
      quantity,
      price,
      totalValue: quantity * price,
      status: "executed",
      timestamp: Date.now(),
    })

    await RedisMonitoring.logEvent("trade_executed", { tradeId, connId, symbol, quantity, price })
    return tradeId
  }

  static async getTradeHistory(connId: string) {
    return await RedisTrades.getTradesByConnection(connId)
  }

  // Position Management
  static async openPosition(
    connId: string,
    symbol: string,
    side: "long" | "short",
    quantity: number,
    entryPrice: number
  ) {
    const posId = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await RedisPositions.createPosition(posId, {
      id: posId,
      connectionId: connId,
      symbol,
      side,
      quantity,
      entryPrice,
      status: "open",
      openedAt: Date.now(),
    })

    await RedisMonitoring.logEvent("position_opened", { posId, connId, symbol, quantity })
    return posId
  }

  static async closePosition(posId: string, exitPrice: number) {
    const position = await RedisPositions.getPosition(posId)
    if (!position) throw new Error(`Position ${posId} not found`)

    const entryPrice = parseFloat(String(position.entryPrice || 0))
    const quantity = parseFloat(String(position.quantity || 0))
    const pnl = (exitPrice - entryPrice) * quantity
    const pnlPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0

    await RedisPositions.updatePosition(posId, {
      status: "closed",
      exitPrice: String(exitPrice),
      closedAt: String(Date.now()),
      pnl: String(pnl),
      pnlPercent: String(pnlPercent),
    })

    await RedisMonitoring.logEvent("position_closed", { posId, pnl, pnlPercent })
  }

  // System Monitoring
  static async getSystemHealth() {
    const stats = await RedisBulkOps.getStatistics()

    return {
      timestamp: Date.now(),
      connections: stats.connections,
      positions: stats.positions,
      trades: stats.trades,
      strategies: stats.strategies,
      presets: stats.presets,
    }
  }

  // Data Management
  static async createBackup() {
    const backupId = `backup_${Date.now()}`
    await RedisBackup.createBackup(backupId)
    return backupId
  }

  static async getSystemStatistics() {
    const stats = await RedisBulkOps.getStatistics()
    const backups = await RedisBackup.listBackups()

    return {
      ...stats,
      backups: backups.length,
      timestamp: Date.now(),
    }
  }

  // Cache Management
  static async cacheExchangeRates(rates: any, ttlSeconds: number = 300) {
    await RedisCache.set("exchange_rates", rates, ttlSeconds)
  }

  static async getCachedExchangeRates() {
    return await RedisCache.get("exchange_rates")
  }

  // Settings Management
  static async initializeDefaultSettings() {
    await RedisSettings.set("max_positions", 10)
    await RedisSettings.set("max_daily_loss", 1000)
    await RedisSettings.set("trading_enabled", true)
    await RedisSettings.set("leverage", 1)
  }

  static async getApplicationSettings() {
    const keys = ["max_positions", "max_daily_loss", "trading_enabled", "leverage"]
    const settings: Record<string, any> = {}
    for (const key of keys) {
      settings[key] = await RedisSettings.get(key)
    }
    return settings
  }
}
