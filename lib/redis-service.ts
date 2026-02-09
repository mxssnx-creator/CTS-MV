/**
 * Redis Service Layer - High-level business logic using Redis operations
 * Orchestrates complex operations across multiple Redis entities
 */

import {
  RedisUsers,
  RedisConnections,
  RedisTrades,
  RedisPositions,
  RedisStrategies,
  RedisPresets,
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

  static async authenticateUser(userId: number) {
    const token = `token_${userId}_${Date.now()}`
    await RedisUsers.setUserSession(userId, token)
    return token
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
      apiPassphrase,
      status: "connected",
      createdAt: Date.now(),
      lastHealthCheck: Date.now(),
    })
    await RedisMonitoring.logEvent("connection_created", { connId, exchange })
  }

  static async updateConnectionHealth(connId: string, isHealthy: boolean) {
    const status = isHealthy ? "healthy" : "unhealthy"
    await RedisConnections.updateConnectionStatus(connId, status, Date.now())
    await RedisMonitoring.recordSystemHealth(`connection:health:${connId}`, isHealthy ? 1 : 0)
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

  static async getTradeHistory(connId: string, hoursBack: number = 24) {
    const startTime = Date.now() - hoursBack * 3600000
    const endTime = Date.now()
    return await RedisTrades.getTradesByTimeRange(startTime, endTime)
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
    const pnl = (exitPrice - position.entryPrice) * position.quantity
    const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100

    await RedisPositions.updatePosition(posId, {
      status: "closed",
      exitPrice,
      closedAt: Date.now(),
      pnl,
      pnlPercent,
    })

    await RedisMonitoring.logEvent("position_closed", { posId, pnl, pnlPercent })
  }

  // Strategy Management
  static async createStrategy(
    stratId: string,
    name: string,
    type: "momentum" | "mean_reversion" | "grid" | "dca" | "custom",
    parameters: any
  ) {
    await RedisStrategies.createStrategy(stratId, {
      id: stratId,
      name,
      type,
      parameters,
      createdAt: Date.now(),
      isActive: false,
      trades: 0,
      winRate: 0,
      profitLoss: 0,
    })

    await RedisMonitoring.logEvent("strategy_created", { stratId, type })
  }

  static async backupStrategyPerformance(stratId: string, trades: number, wins: number) {
    const winRate = trades > 0 ? (wins / trades) * 100 : 0
    await RedisStrategies.recordStrategyPerformance(stratId, winRate, 0)
  }

  // Preset Management
  static async createTradingPreset(
    presetId: string,
    name: string,
    category: string,
    config: any
  ) {
    await RedisPresets.createPreset(presetId, {
      id: presetId,
      name,
      category,
      config,
      createdAt: Date.now(),
      usageCount: 0,
    })
  }

  static async clonePreset(sourcePresetId: string, newPresetId: string) {
    await RedisPresets.duplicatePreset(sourcePresetId, newPresetId)
    await RedisMonitoring.logEvent("preset_cloned", { sourcePresetId, newPresetId })
  }

  // System Monitoring
  static async recordSystemMetrics() {
    const stats = await RedisBulkOps.getStatistics()

    await RedisMonitoring.recordSystemHealth("active_connections", stats.connections)
    await RedisMonitoring.recordSystemHealth("open_positions", stats.positions)
    await RedisMonitoring.recordSystemHealth("total_trades", stats.trades)
    await RedisMonitoring.recordSystemHealth("active_strategies", stats.strategies)
  }

  static async getSystemHealth() {
    const recentMetrics = await RedisMonitoring.getSystemMetrics("active_connections", 3600000)
    const stats = await RedisBulkOps.getStatistics()

    return {
      timestamp: Date.now(),
      connections: stats.connections,
      positions: stats.positions,
      trades: stats.trades,
      strategies: stats.strategies,
      presets: stats.presets,
      recentActivity: recentMetrics.length,
    }
  }

  // Data Management
  static async createBackup() {
    const backupId = `backup_${Date.now()}`
    const allData = await RedisBulkOps.exportAllData()

    await RedisBackup.createSnapshot(backupId, {
      id: backupId,
      dataSize: JSON.stringify(allData).length,
      timestamp: Date.now(),
    })

    await RedisBackup.recordRecoveryPoint(backupId, {
      id: backupId,
      status: "complete",
    })

    return backupId
  }

  static async getSystemStatistics() {
    const stats = await RedisBulkOps.getStatistics()
    const health = await this.getSystemHealth()
    const snapshots = await RedisBackup.listSnapshots()

    return {
      ...stats,
      health,
      backups: snapshots.length,
      timestamp: Date.now(),
    }
  }

  // Cache Management
  static async cacheExchangeRates(rates: any, ttlSeconds: number = 300) {
    await RedisCache.setCacheData("exchange_rates", rates, ttlSeconds)
  }

  static async getCachedExchangeRates() {
    return await RedisCache.getCacheData("exchange_rates")
  }

  // Settings Management
  static async initializeDefaultSettings() {
    await RedisSettings.setSetting("max_positions", 10)
    await RedisSettings.setSetting("max_daily_loss", 1000)
    await RedisSettings.setSetting("trading_enabled", true)
    await RedisSettings.setSetting("leverage", 1)

    await RedisSettings.setFeatureFlag("automated_trading", true)
    await RedisSettings.setFeatureFlag("backtesting", true)
    await RedisSettings.setFeatureFlag("paper_trading", true)

    await RedisSettings.setThreshold("max_position_size", 10000)
    await RedisSettings.setThreshold("min_trade_amount", 10)
    await RedisSettings.setThreshold("max_slippage", 0.5)
  }

  static async getApplicationSettings() {
    return await RedisSettings.getAllSettings()
  }
}
