/**
 * Indication Processor
 * Processes indications asynchronously for symbols using Redis-backed market data
 */

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
  private readonly CACHE_TTL = 30000 // 30 seconds

  constructor(connectionId: string) {
    this.connectionId = connectionId
  }

  /**
   * Process historical indications for a symbol over a date range
   */
  async processHistoricalIndications(symbol: string, startDate: Date, endDate: Date): Promise<void> {
    try {
      console.log(`[v0] Processing historical indications for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`)

      // Fetch historical market data for the symbol
      const redis = await getRedisHelpers()
      await redis.initRedis()
      const rawData = await redis.getMarketData(symbol)

      // getMarketData returns a single object or null, normalize to array
      const historicalData: any[] = Array.isArray(rawData)
        ? rawData
        : rawData
          ? [rawData]
          : []

      if (historicalData.length === 0) {
        // No market data yet - this is expected on first startup
        // Log at debug level only (not every symbol)
        if (Math.random() < 0.1) {
          console.log(`[v0] [Indication] Historical data not available yet - trade engine in startup phase`)
        }
        return
      }

      const settings = await this.getIndicationSettingsCached()

      // Process each data point as a historical indication
      let successCount = 0
      for (const marketData of historicalData) {
        const indication = await this.calculateIndication(symbol, marketData, settings)

        if (indication && indication.profit_factor >= settings.minProfitFactor) {
          await redis.saveIndication({
            connection_id: this.connectionId,
            symbol,
            indication_type: indication.type,
            timeframe: indication.timeframe,
            mode: 'preset',
            value: indication.value,
            profit_factor: indication.profit_factor,
            confidence: indication.confidence,
            metadata: indication.metadata,
            calculated_at: marketData.timestamp || new Date().toISOString(),
          })
          successCount++
        }
      }

      // Track progression for historical processing
      if (successCount > 0) {
        const ProgressionManager = await getProgressionManager()
        await ProgressionManager.incrementCycle(this.connectionId, true, successCount)
      }

      console.log(`[v0] Processed ${historicalData.length} historical indications for ${symbol}`)
    } catch (error) {
      console.error(`[v0] Failed to process historical indications for ${symbol}:`, error)
    }
  }

  /**
   * Process indication in real-time
   */
  async processIndication(symbol: string): Promise<void> {
    try {
      const marketData = await this.getLatestMarketDataCached(symbol)
      if (!marketData) {
        return
      }

      const settings = await this.getIndicationSettingsCached()

      // Calculate indication asynchronously
      const indication = await this.calculateIndication(symbol, marketData, settings)

      if (indication && indication.profit_factor >= settings.minProfitFactor) {
        const redis = await getRedisHelpers()
        await redis.saveIndication({
          connection_id: this.connectionId,
          symbol,
          indication_type: indication.type,
          timeframe: indication.timeframe,
          mode: 'preset',
          value: indication.value,
          profit_factor: indication.profit_factor,
          confidence: indication.confidence,
          metadata: indication.metadata,
          calculated_at: new Date().toISOString(),
        })

        // Only log when indications are actually saved
        console.log(`[v0] [Indication] ${symbol}: ${indication.type} (PF: ${indication.profit_factor.toFixed(2)}, Conf: ${indication.confidence.toFixed(2)})`)
      }
    } catch (error) {
      console.error(`[v0] [Indication] Failed to process ${symbol}:`, error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Calculate indication based on market data
   */
  private async calculateIndication(symbol: string, marketData: any, settings: any): Promise<any> {
    const price = marketData.price || marketData.close || 0
    const open = marketData.open || price
    const high = marketData.high || price
    const low = marketData.low || price
    const volume = marketData.volume || 0

    // Get historical prices for technical analysis
    const historicalPrices = await this.getRecentPrices(symbol, 30)

    if (historicalPrices.length < 10) {
      return null // Not enough data
    }

    const [directionIndication, moveIndication, activeIndication] = await Promise.all([
      Promise.resolve(this.calculateDirectionIndication(historicalPrices, price)),
      Promise.resolve(this.calculateMoveIndication(historicalPrices, price)),
      Promise.resolve(this.calculateActiveIndication(historicalPrices, volume)),
    ])

    // Calculate optimal based on parallel results
    const optimalIndication = this.calculateOptimalIndication(directionIndication, moveIndication, activeIndication)

    // Return the strongest indication
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
      metadata: {
        direction: trend,
        strength,
        avgPrice: avg,
      },
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
      metadata: {
        volatility,
        relativeVolatility,
      },
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
      metadata: {
        volume,
        activity,
      },
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

      // getMarketData returns a single object or null, normalize to array
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

      // getMarketData returns a single object or null - EXPLICITLY GUARD
      if (!rawData) {
        // Silently return null - market data is not available yet
        // This is expected behavior during startup phase
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
