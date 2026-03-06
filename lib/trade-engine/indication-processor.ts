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
    getRedisClient: mod.getRedisClient,
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
   * Get all candles for a symbol - tries multiple Redis keys in priority order:
   * 1. market_data:{symbol}:candles  → JSON array of 250 candles (from loadMarketDataForEngine)
   * 2. market_data:{symbol}:1m       → JSON object with .candles array
   * 3. market_data:{symbol}          → single hash entry (fallback, 1 data point)
   */
  private async getHistoricalCandles(symbol: string): Promise<any[]> {
    try {
      const { getRedisClient: getRC, initRedis: ir } = await import("@/lib/redis-db")
      await ir()
      const client = getRC()

      // Priority 1: raw candles array (250 candles from market-data-loader)
      const candlesRaw = await client.get(`market_data:${symbol}:candles`)
      if (candlesRaw) {
        const candles = JSON.parse(typeof candlesRaw === "string" ? candlesRaw : JSON.stringify(candlesRaw))
        if (Array.isArray(candles) && candles.length > 0) {
          console.log(`[v0] [PrehistoricIndication] Using candles array for ${symbol}: ${candles.length} candles`)
          return candles
        }
      }

      // Priority 2: full MarketData JSON with nested candles
      const marketDataRaw = await client.get(`market_data:${symbol}:1m`)
      if (marketDataRaw) {
        const marketDataObj = JSON.parse(typeof marketDataRaw === "string" ? marketDataRaw : JSON.stringify(marketDataRaw))
        if (marketDataObj?.candles && Array.isArray(marketDataObj.candles) && marketDataObj.candles.length > 0) {
          console.log(`[v0] [PrehistoricIndication] Using market_data:1m candles for ${symbol}: ${marketDataObj.candles.length} candles`)
          return marketDataObj.candles
        }
      }

      // Priority 3: hash (single latest data point from redis-db.saveMarketData / getMarketData)
      const redis = await getRedisHelpers()
      const rawData = await redis.getMarketData(symbol)
      if (rawData) {
        const arr = Array.isArray(rawData) ? rawData : [rawData]
        console.log(`[v0] [PrehistoricIndication] Using hash fallback for ${symbol}: ${arr.length} data point(s)`)
        return arr
      }

      return []
    } catch (error) {
      console.error(`[v0] [PrehistoricIndication] Failed to get candles for ${symbol}:`, error)
      return []
    }
  }

  /**
   * Process historical indications - builds up all 4 independent type sets
   * Prehistoric phase only: evaluation, no trade execution
   */
  async processHistoricalIndications(symbol: string, startDate: Date, endDate: Date): Promise<void> {
    const processStartTime = Date.now()
    const TIMEOUT_MS = 30000 // 30 second timeout per symbol
    
    try {
      console.log(`[v0] [PrehistoricIndication] START: Processing ${symbol} | Period: ${startDate.toISOString()} to ${endDate.toISOString()}`)

      const redis = await getRedisHelpers()
      await redis.initRedis()

      // Use enhanced candle loader (tries candles array first, then hash fallback)
      const historicalData = await this.getHistoricalCandles(symbol)

      if (historicalData.length === 0) {
        console.log(`[v0] [PrehistoricIndication] NO DATA: No market data available for ${symbol}`)
        await logProgressionEvent(this.connectionId, "indications_prehistoric", "warning", `No historical data available for ${symbol}`, {
          symbol,
          reason: "no_market_data",
        })
        return
      }

      console.log(`[v0] [PrehistoricIndication] DATA RETRIEVED: ${historicalData.length} records for ${symbol} (startDate: ${startDate.toISOString()})`)

      const setsProcessor = new IndicationSetsProcessor(this.connectionId)

      let recordsProcessed = 0
      for (const marketData of historicalData) {
        // Check timeout
        const elapsed = Date.now() - processStartTime
        if (elapsed > TIMEOUT_MS) {
          console.warn(`[v0] [PrehistoricIndication] TIMEOUT: Processing exceeded ${TIMEOUT_MS}ms for ${symbol}`)
          await logProgressionEvent(this.connectionId, "indications_prehistoric", "warning", `Historical indication timeout for ${symbol}`, {
            symbol,
            timeoutMs: TIMEOUT_MS,
            elapsedMs: elapsed,
            recordsProcessed,
          })
          break
        }

        await setsProcessor.processAllIndicationSets(symbol, marketData)
        recordsProcessed++
      }

      const directionStats = await setsProcessor.getSetStats(symbol, "direction")
      const moveStats = await setsProcessor.getSetStats(symbol, "move")
      const activeStats = await setsProcessor.getSetStats(symbol, "active")
      const optimalStats = await setsProcessor.getSetStats(symbol, "optimal")

      const ProgressionManager = await getProgressionManager()
      await ProgressionManager.incrementPrehistoricCycle(this.connectionId, symbol)

      const totalEntries = (directionStats?.currentEntries || 0) + (moveStats?.currentEntries || 0) + (activeStats?.currentEntries || 0) + (optimalStats?.currentEntries || 0)
      
      console.log(
        `[v0] [PrehistoricIndication] COMPLETE: ${symbol} | Records=${recordsProcessed} | Total Entries=${totalEntries} | Direction=${directionStats?.currentEntries || 0}/250 Move=${moveStats?.currentEntries || 0}/250 Active=${activeStats?.currentEntries || 0}/250 Optimal=${optimalStats?.currentEntries || 0}/250`
      )

      // CRITICAL: Save prehistoric indications to Redis so realtime phase can access them
      try {
        const { initRedis, saveIndication } = await import("@/lib/redis-db")
        await initRedis()
        
        const prehistoricIndications = []
        if (directionStats && Object.keys(directionStats).length > 0) {
          prehistoricIndications.push({ type: "direction", ...directionStats, phase: "prehistoric" })
        }
        if (moveStats && Object.keys(moveStats).length > 0) {
          prehistoricIndications.push({ type: "move", ...moveStats, phase: "prehistoric" })
        }
        if (activeStats && Object.keys(activeStats).length > 0) {
          prehistoricIndications.push({ type: "active", ...activeStats, phase: "prehistoric" })
        }
        if (optimalStats && Object.keys(optimalStats).length > 0) {
          prehistoricIndications.push({ type: "optimal", ...optimalStats, phase: "prehistoric" })
        }
        
        for (const ind of prehistoricIndications) {
          await saveIndication(`${this.connectionId}:${symbol}:prehistoric`, ind)
        }
        console.log(`[v0] [PrehistoricIndication] ✓ Saved ${prehistoricIndications.length} indication types to Redis for ${symbol}`)
      } catch (saveErr) {
        console.error(`[v0] [PrehistoricIndication] Failed to save indications to Redis:`, saveErr)
      }

      await logProgressionEvent(this.connectionId, "indications_prehistoric", "info", `Historical indications evaluated for ${symbol}`, {
        direction: directionStats,
        move: moveStats,
        active: activeStats,
        optimal: optimalStats,
        dataPoints: historicalData.length,
        recordsProcessed,
        totalEntriesCalculated: totalEntries,
        phase: "prehistoric",
        durationMs: Date.now() - processStartTime,
      })
    } catch (error) {
      const durationMs = Date.now() - processStartTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[v0] [PrehistoricIndication] ERROR for ${symbol} after ${durationMs}ms:`, errorMsg)
      
      await logProgressionEvent(this.connectionId, "indications_prehistoric", "error", `Historical indication processing failed for ${symbol}`, {
        symbol,
        error: errorMsg,
        durationMs,
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  }

  /**
   * Process real-time indication - delegates to independent sets processor
   * Returns array of active indications for strategy processing
   */
  async processIndication(symbol: string): Promise<any[]> {
    try {
      const marketData = await this.getLatestMarketDataCached(symbol)
      if (!marketData) {
        console.log(`[v0] [RealtimeIndication] ${symbol}: NO MARKET DATA AVAILABLE`)
        return []
      }

      // Convert market data candles to prices for indication processor
      let prices: number[] = []
      if (marketData.candles && Array.isArray(marketData.candles)) {
        prices = marketData.candles.map((c: any) => Number.parseFloat(c.close))
      } else if (marketData.prices && Array.isArray(marketData.prices)) {
        prices = marketData.prices.map((p: any) => Number.parseFloat(p))
      }
      
      if (!prices || prices.length === 0) {
        console.log(`[v0] [RealtimeIndication] ${symbol}: NO PRICES EXTRACTED from market data`)
        console.log(`  marketData keys:`, Object.keys(marketData).join(", "))
        console.log(`  has candles:`, !!marketData.candles, `(${marketData.candles?.length || 0})`)
        console.log(`  has prices:`, !!marketData.prices, `(${marketData.prices?.length || 0})`)
        return []
      }

      // Pass prices-enriched market data to processor
      const enrichedMarketData = {
        ...marketData,
        prices: prices
      }

      const setsProcessor = new IndicationSetsProcessor(this.connectionId)
      await setsProcessor.processAllIndicationSets(symbol, enrichedMarketData)

      // Retrieve the indication sets that were just calculated
      const directionSet = await setsProcessor.getSetStats(symbol, "direction")
      const moveSet = await setsProcessor.getSetStats(symbol, "move")
      const activeSet = await setsProcessor.getSetStats(symbol, "active")
      const optimalSet = await setsProcessor.getSetStats(symbol, "optimal")

      // Build indications array from the set stats
      const indications: any[] = []

      if (directionSet && Object.keys(directionSet).length > 0) {
        indications.push({
          type: "direction",
          symbol,
          ...directionSet,
          profitFactor: directionSet.avgProfitFactor || 1.0,
          drawdownTime: directionSet.avgDrawdownTime || 0,
          confidence: directionSet.confidence || 0.5,
          positionState: "new",
          continuousPosition: false,
          metadata: directionSet.metadata || {}
        })
      }

      if (moveSet && Object.keys(moveSet).length > 0) {
        indications.push({
          type: "move",
          symbol,
          ...moveSet,
          profitFactor: moveSet.avgProfitFactor || 1.0,
          drawdownTime: moveSet.avgDrawdownTime || 0,
          confidence: moveSet.confidence || 0.5,
          positionState: "new",
          continuousPosition: false,
          metadata: moveSet.metadata || {}
        })
      }

      if (activeSet && Object.keys(activeSet).length > 0) {
        indications.push({
          type: "active",
          symbol,
          ...activeSet,
          profitFactor: activeSet.avgProfitFactor || 1.0,
          drawdownTime: activeSet.avgDrawdownTime || 0,
          confidence: activeSet.confidence || 0.5,
          positionState: "new",
          continuousPosition: false,
          metadata: activeSet.metadata || {}
        })
      }

      if (optimalSet && Object.keys(optimalSet).length > 0) {
        indications.push({
          type: "optimal",
          symbol,
          ...optimalSet,
          profitFactor: optimalSet.avgProfitFactor || 1.0,
          drawdownTime: optimalSet.avgDrawdownTime || 0,
          confidence: optimalSet.confidence || 0.5,
          positionState: "new",
          continuousPosition: false,
          metadata: optimalSet.metadata || {}
        })
      }

      // Store indication result in Redis for progression tracking and realtime processing
      try {
        const { initRedis, saveIndication } = await import("@/lib/redis-db")
        await initRedis()
        
        // Use correct key format: ${connectionId}:${symbol} (matches strategy processor expectation)
        const connKey = `${this.connectionId}:${symbol}`
        for (const ind of indications) {
          await saveIndication(connKey, ind)
        }
        
        if (indications.length > 0) {
          console.log(`[v0] [RealtimeIndication] ✓ Saved ${indications.length} indications to Redis key: ${connKey}`)
        }
      } catch (redisErr) {
        console.error(`[v0] [RealtimeIndication] Failed to save to Redis:`, redisErr)
        // Redis error is not critical - indications still process correctly
      }

      console.log(`[v0] [RealtimeIndication] ${symbol}: Processed ${indications.length} indication types`)

      await logProgressionEvent(
        this.connectionId,
        "indication_realtime",
        "info",
        `Processed indication sets for ${symbol}`,
        { indicationTypes: indications.length }
      )

      return indications
    } catch (error) {
      console.error(`[v0] [RealtimeIndication] Failed for ${symbol}:`, error instanceof Error ? error.message : String(error))
      return []
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
