/**
 * Independent Strategy Sets Processor
 * Maintains separate 250-entry pools for each strategy calculation type
 * Each type evaluates independently with own set configurations
 */

import { getRedisClient, initRedis, getSettings, setSettings } from "@/lib/redis-db"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

export interface StrategySet {
  type: "base" | "main" | "real" | "live"
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

export class StrategySetsProcessor {
  private connectionId: string
  private maxEntriesPerSet = 250 // Configurable in settings

  constructor(connectionId: string) {
    this.connectionId = connectionId
    this.loadSettings()
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await getSettings("strategy_sets_config")
      if (settings?.maxEntriesPerSet) {
        this.maxEntriesPerSet = Number.parseInt(String(settings.maxEntriesPerSet))
      }
    } catch (error) {
      console.error("[v0] [StrategySets] Failed to load settings:", error)
    }
  }

  /**
   * Process all strategy types independently for a symbol
   */
  async processAllStrategySets(symbol: string, indications: any[]): Promise<void> {
    try {
      const startTime = Date.now()

      // Process all 4 strategy types in parallel with independent logic
      const [baseResults, mainResults, realResults, liveResults] = await Promise.all([
        this.processBaseStrategySet(symbol, indications),
        this.processMainStrategySet(symbol, indications),
        this.processRealStrategySet(symbol, indications),
        this.processLiveStrategySet(symbol, indications),
      ])

      const duration = Date.now() - startTime
      const totalQualified =
        (baseResults?.qualified || 0) +
        (mainResults?.qualified || 0) +
        (realResults?.qualified || 0) +
        (liveResults?.qualified || 0)

      if (totalQualified > 0) {
        console.log(
          `[v0] [StrategySets] ${symbol}: All types evaluated in ${duration}ms | Base=${baseResults?.qualified}/${baseResults?.total} Main=${mainResults?.qualified}/${mainResults?.total} Real=${realResults?.qualified}/${realResults?.total} Live=${liveResults?.qualified}/${liveResults?.total}`
        )

        await logProgressionEvent(this.connectionId, "strategies_sets", "info", `All strategy types evaluated for ${symbol}`, {
          base: baseResults,
          main: mainResults,
          real: realResults,
          live: liveResults,
          duration,
        })
      }
    } catch (error) {
      console.error(`[v0] [StrategySets] Failed to process sets for ${symbol}:`, error)
    }
  }

  /**
   * Base Strategy Set - Conservative, low-risk signals only
   */
  private async processBaseStrategySet(symbol: string, indications: any[]): Promise<any> {
    const setKey = `strategy_set:${this.connectionId}:${symbol}:base`
    let qualified = 0
    let total = 0

    for (const indication of indications) {
      try {
        total++
        // Base: Only highest confidence indications (>0.8) with profit factor > 1.5
        if (indication.confidence > 0.8 && indication.profitFactor > 1.5) {
          const strategy = {
            profitFactor: indication.profitFactor * 0.9, // Conservative discount
            confidence: indication.confidence,
            metadata: { ...indication.metadata, strategyType: "base", riskLevel: "low" },
          }

          if (strategy.profitFactor >= 1.0) {
            qualified++
            await this.saveStrategyToSet(setKey, strategy, "base", indication.type)
          }
        }
      } catch (error) {
        console.error(`[v0] [StrategySets] Base strategy error:`, error)
      }
    }

    return { type: "base", total, qualified }
  }

  /**
   * Main Strategy Set - Balanced, medium-risk signals
   */
  private async processMainStrategySet(symbol: string, indications: any[]): Promise<any> {
    const setKey = `strategy_set:${this.connectionId}:${symbol}:main`
    let qualified = 0
    let total = 0

    for (const indication of indications) {
      try {
        total++
        // Main: Confidence >0.6 with profit factor > 1.2
        if (indication.confidence > 0.6 && indication.profitFactor > 1.2) {
          const strategy = {
            profitFactor: indication.profitFactor,
            confidence: indication.confidence,
            metadata: { ...indication.metadata, strategyType: "main", riskLevel: "medium" },
          }

          if (strategy.profitFactor >= 1.0) {
            qualified++
            await this.saveStrategyToSet(setKey, strategy, "main", indication.type)
          }
        }
      } catch (error) {
        console.error(`[v0] [StrategySets] Main strategy error:`, error)
      }
    }

    return { type: "main", total, qualified }
  }

  /**
   * Real Strategy Set - Aggressive, higher-risk signals
   */
  private async processRealStrategySet(symbol: string, indications: any[]): Promise<any> {
    const setKey = `strategy_set:${this.connectionId}:${symbol}:real`
    let qualified = 0
    let total = 0

    for (const indication of indications) {
      try {
        total++
        // Real: Confidence >0.5 with profit factor > 1.0
        if (indication.confidence > 0.5 && indication.profitFactor > 1.0) {
          const strategy = {
            profitFactor: indication.profitFactor * 1.1, // Aggressive multiplier
            confidence: indication.confidence,
            metadata: { ...indication.metadata, strategyType: "real", riskLevel: "high" },
          }

          if (strategy.profitFactor >= 1.0) {
            qualified++
            await this.saveStrategyToSet(setKey, strategy, "real", indication.type)
          }
        }
      } catch (error) {
        console.error(`[v0] [StrategySets] Real strategy error:`, error)
      }
    }

    return { type: "real", total, qualified }
  }

  /**
   * Live Strategy Set - All qualifying signals, real-time only
   */
  private async processLiveStrategySet(symbol: string, indications: any[]): Promise<any> {
    const setKey = `strategy_set:${this.connectionId}:${symbol}:live`
    let qualified = 0
    let total = 0

    for (const indication of indications) {
      try {
        total++
        // Live: All indications with any positive profit factor
        if (indication.profitFactor >= 1.0) {
          const strategy = {
            profitFactor: indication.profitFactor,
            confidence: indication.confidence,
            metadata: { ...indication.metadata, strategyType: "live", riskLevel: "variable" },
          }

          qualified++
          await this.saveStrategyToSet(setKey, strategy, "live", indication.type)
        }
      } catch (error) {
        console.error(`[v0] [StrategySets] Live strategy error:`, error)
      }
    }

    return { type: "live", total, qualified }
  }

  /**
   * Save strategy to its independent set pool (max 250 entries)
   */
  private async saveStrategyToSet(
    setKey: string,
    strategy: any,
    strategyType: string,
    indicationType: string
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

      // Add new strategy
      entries.unshift({
        id: `${strategyType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        profitFactor: strategy.profitFactor,
        confidence: strategy.confidence,
        indicationType,
        strategyType,
        metadata: strategy.metadata,
      })

      // Trim to max entries
      if (entries.length > this.maxEntriesPerSet) {
        entries = entries.slice(0, this.maxEntriesPerSet)
      }

      // Save back
      await client.set(setKey, JSON.stringify(entries))

      // Update stats
      const statsKey = `${setKey}:stats`
      const prevStats = (await getSettings(statsKey)) || {}
      const stats = {
        maxEntries: this.maxEntriesPerSet,
        currentEntries: entries.length,
        totalCalculated: (prevStats.totalCalculated || 0) + 1,
        totalQualified: (prevStats.totalQualified || 0) + 1,
        avgProfitFactor: entries.reduce((sum: number, e: any) => sum + e.profitFactor, 0) / entries.length,
        lastCalculated: new Date().toISOString(),
      }
      await setSettings(statsKey, stats)
    } catch (error) {
      console.error(`[v0] [StrategySets] Failed to save to ${setKey}:`, error)
    }
  }

  /**
   * Get stats for a specific strategy type set
   */
  async getSetStats(symbol: string, type: string): Promise<any> {
    try {
      const setKey = `strategy_set:${this.connectionId}:${symbol}:${type}:stats`
      return await getSettings(setKey)
    } catch (error) {
      console.error(`[v0] [StrategySets] Failed to get stats for ${type}:`, error)
      return null
    }
  }

  /**
   * Get all entries from a specific strategy type set
   */
  async getSetEntries(symbol: string, type: string, limit = 50): Promise<any[]> {
    try {
      const client = await initRedis()
      const setKey = `strategy_set:${this.connectionId}:${symbol}:${type}`
      const data = await client.get(setKey)

      if (!data) return []

      const entries = JSON.parse(data)
      return entries.slice(0, limit)
    } catch (error) {
      console.error(`[v0] [StrategySets] Failed to get entries for ${type}:`, error)
      return []
    }
  }
}
