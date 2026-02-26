/**
 * Indication Processor
 * Processes independent indication sets for each type (Direction, Move, Active, Optimal)
 * Each type maintains its own 250-entry pool calculated independently
 */

import { IndicationSetsProcessor } from "@/lib/indication-sets-processor"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

// Dynamic imports to avoid build-time resolution issues
async function getRedisHelpers() {
  const mod = await import("@/lib/redis-db")
  return {
    initRedis: mod.initRedis,
    getMarketData: mod.getMarketData ?? (async (_s: string) => null),
    saveIndication: mod.saveIndication ?? (async (_d: any) => ""),
    getSettings: mod.getSettings,
  }
}

async function getProgressionManager() {
  const mod = await import("@/lib/progression-state-manager")
  return mod.ProgressionStateManager
}

export class IndicationProcessor {
  private connectionId: string
  private marketDataCache: Map<string, { data: any; timestamp: number }> = new Map()
  private settingsCache: { data: any; timestamp: number } | null = null
  private readonly CACHE_TTL = 30000

  constructor(connectionId: string) {
    this.connectionId = connectionId
  }

  /**
   * Process historical indications - builds up all 4 independent type sets
   * Prehistoric phase only: evaluation, no trade execution
   */
  async processHistoricalIndications(symbol: string, startDate: Date, endDate: Date): Promise<void> {
    try {
      console.log(`[v0] [PrehistoricIndication] Processing for ${symbol} | Period: ${startDate.toISOString()} to ${endDate.toISOString()}`)

      const redis = await getRedisHelpers()
      await redis.initRedis()
      const rawData = await redis.getMarketData(symbol)

      const historicalData: any[] = Array.isArray(rawData)
        ? rawData
        : rawData
          ? [rawData]
          : []

      if (historicalData.length === 0) {
        console.log(`[v0] [PrehistoricIndication] No data available yet for ${symbol}`)
        return
      }

      const setsProcessor = new IndicationSetsProcessor(this.connectionId)

      for (const marketData of historicalData) {
        await setsProcessor.processAllIndicationSets(symbol, marketData)
      }

      const directionStats = await setsProcessor.getSetStats(symbol, "direction")
      const moveStats = await setsProcessor.getSetStats(symbol, "move")
      const activeStats = await setsProcessor.getSetStats(symbol, "active")
      const optimalStats = await setsProcessor.getSetStats(symbol, "optimal")

      const ProgressionManager = await getProgressionManager()
      await ProgressionManager.incrementPrehistoricCycle(this.connectionId, symbol)

      console.log(
        `[v0] [PrehistoricIndication] ${symbol}: Evaluated ${historicalData.length} data points (no trades) | Direction=${directionStats?.currentEntries || 0}/${directionStats?.maxEntries || 250} Move=${moveStats?.currentEntries || 0}/${moveStats?.maxEntries || 250} Active=${activeStats?.currentEntries || 0}/${activeStats?.maxEntries || 250} Optimal=${optimalStats?.currentEntries || 0}/${optimalStats?.maxEntries || 250}`
      )

      await logProgressionEvent(this.connectionId, "indications_prehistoric", "info", `Historical indications evaluated for ${symbol}`, {
        direction: directionStats,
        move: moveStats,
        active: activeStats,
        optimal: optimalStats,
        dataPoints: historicalData.length,
        phase: "prehistoric",
      })
    } catch (error) {
      console.error(`[v0] [PrehistoricIndication] Failed for ${symbol}:`, error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Process real-time indication - delegates to independent sets processor
   * Same calculation logic as prehistoric, but with trade execution enabled
   */
  async processIndication(symbol: string): Promise<void> {
    try {
      const marketData = await this.getLatestMarketDataCached(symbol)
      if (!marketData) {
        return
      }

      const setsProcessor = new IndicationSetsProcessor(this.connectionId)
      await setsProcessor.processAllIndicationSets(symbol, marketData)

      await logProgressionEvent(
        this.connectionId,
        "indication_realtime",
        "info",
        `Processed indication sets for ${symbol}`
      )
    } catch (error) {
      console.error(`[v0] [RealtimeIndication] Failed for ${symbol}:`, error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Calculate indication - evaluates all 4 types and returns strongest
   */
  async calculateIndication(symbol: string, marketData: any, _settings: any): Promise<any> {
    const price = marketData.price || marketData.close || 0
    const volume = marketData.volume || 0

    const historicalPrices = await this.getRecentPrices(symbol, 30)

    if (historicalPrices.length < 10) {
      return null
    }

    const [directionIndication, moveIndication, activeIndication] = await Promise.all([
      Promise.resolve(this.calculateDirectionIndication(historicalPrices, price)),
      Promise.resolve(this.calculateMoveIndication(historicalPrices, price)),
      Promise.resolve(this.calculateActiveIndication(historicalPrices, volume)),
    ])

    const optimalIndication = this.calculateOptimalIndication(directionIndication, moveIndication, activeIndication)

    const indications = [directionIndication, moveIndication, activeIndication, optimalIndication]
      .filter((i) => i !== null)
      .sort((a, b) => b.profit_factor - a.profit_factor)

    return indications[0] || null
  }

  private calculateDirectionIndication(prices: number[], currentPrice: number): any {
    if (prices.length < 10) return null

    const recent = prices.slice(-10)
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length
    const trend = currentPrice > avg ? "long" : "short"
    const strength = Math.abs((currentPrice - avg) / avg)

    return {
      type: "direction",
      timeframe: "1h",
      value: trend === "long" ? 1 : -1,
      profit_factor: 1 + strength,
      confidence: Math.min(0.9, 0.5 + strength),
      metadata: { direction: trend, strength, avgPrice: avg },
    }
  }

  private calculateMoveIndication(prices: number[], currentPrice: number): any {
    if (prices.length < 5) return null

    const recent = prices.slice(-5)
    const volatility = Math.max(...recent) - Math.min(...recent)
    const relativeVolatility = volatility / currentPrice

    return {
      type: "move",
      timeframe: "1h",
      value: relativeVolatility * 100,
      profit_factor: 1 + relativeVolatility * 2,
      confidence: Math.min(0.85, 0.4 + relativeVolatility),
      metadata: { volatility, relativeVolatility },
    }
  }

  private calculateActiveIndication(prices: number[], volume: number): any {
    if (prices.length < 3) return null

    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length
    const activity = volume / (avgPrice || 1)

    return {
      type: "active",
      timeframe: "1h",
      value: activity,
      profit_factor: 1 + Math.min(activity / 1000, 0.5),
      confidence: Math.min(0.8, 0.3 + activity / 2000),
      metadata: { volume, activity },
    }
  }

  private calculateOptimalIndication(direction: any, move: any, active: any): any {
    const components = [direction, move, active].filter((i) => i !== null)
    if (components.length === 0) return null

    const avgProfitFactor = components.reduce((sum, i) => sum + i.profit_factor, 0) / components.length
    const avgConfidence = components.reduce((sum, i) => sum + i.confidence, 0) / components.length

    return {
      type: "optimal",
      timeframe: "1h",
      value: avgProfitFactor * 100,
      profit_factor: avgProfitFactor,
      confidence: avgConfidence,
      metadata: {
        direction: direction?.metadata.direction || "neutral",
        components: { direction, move, active },
        timestamp: new Date().toISOString(),
      },
    }
  }

  private async getRecentPrices(symbol: string, _count: number): Promise<number[]> {
    try {
      const redis = await getRedisHelpers()
      await redis.initRedis()
      const rawData = await redis.getMarketData(symbol)

      const dataList: any[] = Array.isArray(rawData)
        ? rawData
        : rawData
          ? [rawData]
          : []

      return dataList.map((d: any) => d.close || d.price || 0).reverse()
    } catch {
      return []
    }
  }

  private async getLatestMarketDataCached(symbol: string): Promise<any> {
    const now = Date.now()
    const cached = this.marketDataCache.get(symbol)

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.data
    }

    try {
      const redis = await getRedisHelpers()
      await redis.initRedis()
      const rawData = await redis.getMarketData(symbol)

      if (!rawData) {
        return null
      }

      const latest = Array.isArray(rawData) ? rawData[0] : rawData

      if (latest) {
        this.marketDataCache.set(symbol, { data: latest, timestamp: now })
        return latest
      }
      return null
    } catch (error) {
      console.error(`[v0] Failed to get market data for ${symbol}:`, error)
      return null
    }
  }

  private async getIndicationSettingsCached(): Promise<any> {
    const now = Date.now()

    if (this.settingsCache && now - this.settingsCache.timestamp < this.CACHE_TTL) {
      return this.settingsCache.data
    }

    try {
      const redis = await getRedisHelpers()
      const settings = await redis.getSettings("all_settings") || {}

      const indicationSettings = {
        minProfitFactor: settings.minProfitFactor || 1.2,
        minConfidence: settings.minConfidence || 0.6,
        timeframes: settings.timeframes || ["1h", "4h", "1d"],
      }

      this.settingsCache = { data: indicationSettings, timestamp: now }
      return indicationSettings
    } catch {
      return {
        minProfitFactor: 1.2,
        minConfidence: 0.6,
        timeframes: ["1h", "4h", "1d"],
      }
    }
  }
}
