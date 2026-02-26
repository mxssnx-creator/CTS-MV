/**
 * Independent Indication Sets Processor
 * Maintains separate 250-entry pools for each indication type
 * Each type calculates independently with own set configurations
 */

import { getRedisClient, initRedis, getSettings, setSettings } from "@/lib/redis-db"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

export interface IndicationSet {
  type: "direction" | "move" | "active" | "optimal" | "active_advanced"
  connectionId: string
  symbol: string
  entries: Array<{
    id: string
    timestamp: Date
    profitFactor: number
    confidence: number
    config: any
    metadata: any
  }>
  maxEntries: number // Configurable, default 250
  stats: {
    totalCalculated: number
    totalQualified: number
    avgProfitFactor: number
    lastCalculated: Date | null
  }
}

export class IndicationSetsProcessor {
  private connectionId: string
  private sets: Map<string, IndicationSet> = new Map()
  private maxEntriesPerSet = 250 // Configurable in settings

  constructor(connectionId: string) {
    this.connectionId = connectionId
    this.loadSettings()
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await getSettings("indication_sets_config")
      if (settings?.maxEntriesPerSet) {
        this.maxEntriesPerSet = Number.parseInt(String(settings.maxEntriesPerSet))
      }
    } catch (error) {
      console.error("[v0] [IndicationSets] Failed to load settings:", error)
    }
  }

  /**
   * Process all indication types independently for a symbol
   */
  async processAllIndicationSets(symbol: string, marketData: any): Promise<void> {
    const startTime = Date.now()
    const TIMEOUT_MS = 15000 // 15 second timeout per symbol
    
    try {
      if (!marketData) {
        console.warn(`[v0] [IndicationSets] Invalid market data for ${symbol}`)
        await logProgressionEvent(this.connectionId, "indications_sets", "warning", `Invalid market data for ${symbol}`, {
          symbol,
          reason: "null_market_data",
        })
        return
      }

      // Process all 4 main types in parallel with independent logic
      const [directionResults, moveResults, activeResults, optimalResults] = await Promise.all([
        this.processDirectionSet(symbol, marketData),
        this.processMoveSet(symbol, marketData),
        this.processActiveSet(symbol, marketData),
        this.processOptimalSet(symbol, marketData),
      ])

      const duration = Date.now() - startTime
      
      // Check for timeout
      if (duration > TIMEOUT_MS) {
        console.warn(`[v0] [IndicationSets] TIMEOUT: Processing exceeded ${TIMEOUT_MS}ms for ${symbol} (took ${duration}ms)`)
        await logProgressionEvent(this.connectionId, "indications_sets", "warning", `Indication set processing timeout for ${symbol}`, {
          symbol,
          timeoutMs: TIMEOUT_MS,
          actualMs: duration,
        })
        return
      }

      const totalQualified = 
        (directionResults?.qualified || 0) +
        (moveResults?.qualified || 0) +
        (activeResults?.qualified || 0) +
        (optimalResults?.qualified || 0)

      if (totalQualified > 0) {
        console.log(
          `[v0] [IndicationSets] ${symbol}: COMPLETE in ${duration}ms | Direction=${directionResults?.qualified}/${directionResults?.total} Move=${moveResults?.qualified}/${moveResults?.total} Active=${activeResults?.qualified}/${activeResults?.total} Optimal=${optimalResults?.qualified}/${optimalResults?.total}`
        )

        await logProgressionEvent(this.connectionId, "indications_sets", "info", `All indication types processed for ${symbol}`, {
          direction: directionResults,
          move: moveResults,
          active: activeResults,
          optimal: optimalResults,
          duration,
        })
      }
    } catch (error) {
      console.error(`[v0] [IndicationSets] Failed to process sets for ${symbol}:`, error)
    }
  }

  /**
   * Process Direction Indication Set (ranges 3-30)
   */
  private async processDirectionSet(symbol: string, marketData: any): Promise<any> {
    const setKey = `indication_set:${this.connectionId}:${symbol}:direction`
    const ranges = Array.from({ length: 28 }, (_, i) => i + 3) // 3 to 30
    let qualified = 0
    let total = 0

    for (const range of ranges) {
      try {
        const indication = this.calculateDirectionIndication(marketData, range)
        if (indication) {
          total++
          if (indication.profitFactor >= 1.0) {
            qualified++
            await this.saveIndicationToSet(setKey, indication, "direction", range)
          }
        }
      } catch (error) {
        console.error(`[v0] [IndicationSets] Direction range ${range} error:`, error)
      }
    }

    return { type: "direction", total, qualified }
  }

  /**
   * Process Move Indication Set (ranges 3-30, no opposite requirement)
   */
  private async processMoveSet(symbol: string, marketData: any): Promise<any> {
    const setKey = `indication_set:${this.connectionId}:${symbol}:move`
    const ranges = Array.from({ length: 28 }, (_, i) => i + 3)
    let qualified = 0
    let total = 0

    for (const range of ranges) {
      try {
        const indication = this.calculateMoveIndication(marketData, range)
        if (indication) {
          total++
          if (indication.profitFactor >= 1.0) {
            qualified++
            await this.saveIndicationToSet(setKey, indication, "move", range)
          }
        }
      } catch (error) {
        console.error(`[v0] [IndicationSets] Move range ${range} error:`, error)
      }
    }

    return { type: "move", total, qualified }
  }

  /**
   * Process Active Indication Set (thresholds 0.5-2.5%)
   */
  private async processActiveSet(symbol: string, marketData: any): Promise<any> {
    const setKey = `indication_set:${this.connectionId}:${symbol}:active`
    const thresholds = [0.5, 1.0, 1.5, 2.0, 2.5]
    let qualified = 0
    let total = 0

    for (const threshold of thresholds) {
      try {
        const indication = this.calculateActiveIndication(marketData, threshold)
        if (indication) {
          total++
          if (indication.profitFactor >= 1.0) {
            qualified++
            await this.saveIndicationToSet(setKey, indication, "active", threshold)
          }
        }
      } catch (error) {
        console.error(`[v0] [IndicationSets] Active threshold ${threshold}% error:`, error)
      }
    }

    return { type: "active", total, qualified }
  }

  /**
   * Process Optimal Indication Set (consecutive step detection, ranges 3-30)
   */
  private async processOptimalSet(symbol: string, marketData: any): Promise<any> {
    const setKey = `indication_set:${this.connectionId}:${symbol}:optimal`
    const ranges = Array.from({ length: 28 }, (_, i) => i + 3)
    let qualified = 0
    let total = 0

    for (const range of ranges) {
      try {
        const indication = this.calculateOptimalIndication(marketData, range)
        if (indication) {
          total++
          if (indication.profitFactor >= 1.0) {
            qualified++
            await this.saveIndicationToSet(setKey, indication, "optimal", range)
          }
        }
      } catch (error) {
        console.error(`[v0] [IndicationSets] Optimal range ${range} error:`, error)
      }
    }

    return { type: "optimal", total, qualified }
  }

  /**
   * Save indication to its independent set pool (max 250 entries)
   */
  private async saveIndicationToSet(
    setKey: string,
    indication: any,
    type: string,
    config: any
  ): Promise<void> {
    try {
      const client = await initRedis()
      let entries: any[] = []

      const existing = await client.get(setKey)
      if (existing) {
        try {
          entries = JSON.parse(existing)
        } catch {
          entries = []
        }
      }

      // Add new indication
      entries.unshift({
        id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        profitFactor: indication.profitFactor,
        confidence: indication.confidence,
        config,
        metadata: indication.metadata,
      })

      // Trim to max entries
      if (entries.length > this.maxEntriesPerSet) {
        entries = entries.slice(0, this.maxEntriesPerSet)
      }

      // Save back
      await client.set(setKey, JSON.stringify(entries))

      // Update stats
      const statsKey = `${setKey}:stats`
      const stats = {
        maxEntries: this.maxEntriesPerSet,
        currentEntries: entries.length,
        totalCalculated: ((await getSettings(statsKey))?.totalCalculated || 0) + 1,
        totalQualified: ((await getSettings(statsKey))?.totalQualified || 0) + 1,
        avgProfitFactor: entries.reduce((sum: number, e: any) => sum + e.profitFactor, 0) / entries.length,
        lastCalculated: new Date().toISOString(),
      }
      await setSettings(statsKey, stats)
    } catch (error) {
      console.error(`[v0] [IndicationSets] Failed to save to ${setKey}:`, error)
    }
  }

  /**
   * Calculation methods for each type
   */

  private calculateDirectionIndication(marketData: any, range: number): any {
    const prices = this.getPriceHistory(marketData, range * 2)
    if (!prices || prices.length < range * 2) return null

    const firstHalf = prices.slice(0, range)
    const secondHalf = prices.slice(range)

    const firstDir = this.getDirection(firstHalf)
    const secondDir = this.getDirection(secondHalf)

    // Opposite direction = signal
    if ((firstDir > 0 && secondDir < 0) || (firstDir < 0 && secondDir > 0)) {
      return {
        profitFactor: 1.0 + Math.abs(firstDir + secondDir),
        confidence: Math.min(1.0, (Math.abs(firstDir) + Math.abs(secondDir)) / 2),
        metadata: { firstDir, secondDir, range },
      }
    }

    return null
  }

  private calculateMoveIndication(marketData: any, range: number): any {
    const prices = this.getPriceHistory(marketData, range)
    if (!prices || prices.length < range) return null

    const movement = Math.abs(prices[0] - prices[range - 1]) / prices[range - 1]
    const volatility = this.calculateVolatility(prices)

    return {
      profitFactor: 1.0 + movement * 2 + volatility,
      confidence: Math.min(1.0, movement + volatility / 2),
      metadata: { movement, volatility, range },
    }
  }

  private calculateActiveIndication(marketData: any, threshold: number): any {
    const prices = this.getPriceHistory(marketData, 10)
    if (!prices || prices.length < 2) return null

    const priceChange = Math.abs((prices[0] - prices[prices.length - 1]) / prices[prices.length - 1]) * 100

    if (priceChange >= threshold) {
      return {
        profitFactor: 1.0 + priceChange / 100,
        confidence: Math.min(1.0, priceChange / threshold / 2),
        metadata: { priceChange, threshold },
      }
    }

    return null
  }

  private calculateOptimalIndication(marketData: any, range: number): any {
    const prices = this.getPriceHistory(marketData, range * 3)
    if (!prices || prices.length < range * 3) return null

    // Consecutive steps: multiple direction changes = optimal signal
    const steps = this.detectConsecutiveSteps(prices, range)

    if (steps >= 2) {
      const volatility = this.calculateVolatility(prices)
      return {
        profitFactor: 1.0 + steps * 0.5 + volatility,
        confidence: Math.min(1.0, steps / 3),
        metadata: { consecutiveSteps: steps, volatility, range },
      }
    }

    return null
  }

  /**
   * Helper methods
   */

  private getPriceHistory(marketData: any, count: number): number[] | null {
    const prices = marketData.prices || []
    return prices.slice(0, count).map((p: any) => Number.parseFloat(p))
  }

  private getDirection(prices: number[]): number {
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length
    return prices.reduce((a, b) => a + (b > avg ? 1 : -1), 0) / prices.length
  }

  private calculateVolatility(prices: number[]): number {
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length
    const variance = prices.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / prices.length
    return Math.sqrt(variance) / avg
  }

  private detectConsecutiveSteps(prices: number[], range: number): number {
    let steps = 0
    for (let i = range; i < prices.length - range; i += range) {
      const dir1 = this.getDirection(prices.slice(i - range, i))
      const dir2 = this.getDirection(prices.slice(i, i + range))
      if ((dir1 > 0 && dir2 < 0) || (dir1 < 0 && dir2 > 0)) {
        steps++
      }
    }
    return steps
  }

  /**
   * Get stats for a specific indication type set
   */
  async getSetStats(symbol: string, type: string): Promise<any> {
    try {
      const setKey = `indication_set:${this.connectionId}:${symbol}:${type}:stats`
      return await getSettings(setKey)
    } catch (error) {
      console.error(`[v0] [IndicationSets] Failed to get stats for ${type}:`, error)
      return null
    }
  }

  /**
   * Get all entries from a specific indication type set
   */
  async getSetEntries(symbol: string, type: string, limit = 50): Promise<any[]> {
    try {
      const client = await initRedis()
      const setKey = `indication_set:${this.connectionId}:${symbol}:${type}`
      const data = await client.get(setKey)

      if (!data) return []

      const entries = JSON.parse(data)
      return entries.slice(0, limit)
    } catch (error) {
      console.error(`[v0] [IndicationSets] Failed to get entries for ${type}:`, error)
      return []
    }
  }
}
