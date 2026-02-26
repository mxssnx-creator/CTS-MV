/**
 * Strategy Processor
 * Processes independent strategy sets for each type (Base, Main, Real, Live)
 * Each type evaluates with its own risk profile and maintains 250-entry pool
 */

import { initRedis, getSettings } from "@/lib/redis-db"
import { ProgressionStateManager } from "@/lib/progression-state-manager"
import { StrategySetsProcessor } from "@/lib/strategy-sets-processor"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

export class StrategyProcessor {
  private connectionId: string
  private strategyCache: Map<string, { signal: any; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 60000 // 60 seconds

  constructor(connectionId: string) {
    this.connectionId = connectionId
  }

  /**
   * Process strategy - delegates to independent sets processor
   */
  async processStrategy(symbol: string): Promise<void> {
    try {
      await initRedis()
      const indications = await this.getActiveIndications(symbol)

      if (indications.length === 0) {
        return
      }

      // Use independent strategy sets processor for all 4 types
      const setsProcessor = new StrategySetsProcessor(this.connectionId)
      await setsProcessor.processAllStrategySets(symbol, indications)

      // Track progression
      const baseStats = await setsProcessor.getSetStats(symbol, "base")
      const mainStats = await setsProcessor.getSetStats(symbol, "main")
      const realStats = await setsProcessor.getSetStats(symbol, "real")
      const liveStats = await setsProcessor.getSetStats(symbol, "live")

      const totalQualified =
        (baseStats?.currentEntries || 0) +
        (mainStats?.currentEntries || 0) +
        (realStats?.currentEntries || 0) +
        (liveStats?.currentEntries || 0)

      if (totalQualified > 0) {
        await ProgressionStateManager.incrementCycle(this.connectionId, true, totalQualified)
        console.log(
          `[v0] [Strategy] ${symbol}: Created ${totalQualified} strategies | Base=${baseStats?.currentEntries}/${baseStats?.maxEntries} Main=${mainStats?.currentEntries}/${mainStats?.maxEntries} Real=${realStats?.currentEntries}/${realStats?.maxEntries} Live=${liveStats?.currentEntries}/${liveStats?.maxEntries}`
        )

        await logProgressionEvent(this.connectionId, "strategies_realtime", "info", `Strategy sets evaluated for ${symbol}`, {
          base: baseStats,
          main: mainStats,
          real: realStats,
          live: liveStats,
          totalQualified,
        })
      }
    } catch (error) {
      await ProgressionStateManager.incrementCycle(this.connectionId, false, 0)
      console.error(
        `[v0] [Strategy] Failed for ${symbol}:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  /**
   * Process historical strategies for prehistoric data
   */
  async processHistoricalStrategies(symbol: string, start: Date, end: Date): Promise<void> {
    try {
      console.log(`[v0] Processing historical strategies for ${symbol}`)

      await initRedis()
      const indications = await this.getHistoricalIndications(symbol, start, end)
      const settings = await this.getStrategySettings()

      let recordsProcessed = 0

      for (const indication of indications) {
        const strategySignal = await this.evaluateStrategy(symbol, indication, settings)

        if (strategySignal && strategySignal.profit_factor >= settings.minProfitFactor) {
          await this.createPseudoPosition(symbol, indication, strategySignal, indication.calculated_at)
          recordsProcessed++
        }
      }

      console.log(`[v0] Processed ${recordsProcessed} historical strategies for ${symbol}`)
    } catch (error) {
      console.error(`[v0] Failed to process historical strategies for ${symbol}:`, error)
    }
  }

  /**
   * Evaluate strategy based on indication
   */
  private async evaluateStrategy(symbol: string, indication: any, settings: any): Promise<any> {
    const strategies: any[] = []

    if (settings.trailingEnabled && indication.profit_factor >= 0.8) {
      const trailingSignal = this.evaluateTrailingStrategy(indication, settings)
      if (trailingSignal) strategies.push(trailingSignal)
    }

    if (settings.blockEnabled && indication.confidence >= 60) {
      const blockSignal = this.evaluateBlockStrategy(indication, settings)
      if (blockSignal) strategies.push(blockSignal)
    }

    if (settings.dcaEnabled && indication.profit_factor >= 0.5) {
      const dcaSignal = this.evaluateDCAStrategy(indication, settings)
      if (dcaSignal) strategies.push(dcaSignal)
    }

    if (strategies.length === 0) return null

    return strategies.sort((a, b) => b.profit_factor - a.profit_factor)[0]
  }

  private evaluateTrailingStrategy(indication: any, settings: any): any {
    const direction = indication.metadata?.direction || "long"
    const baseTP = 1.5 + indication.profit_factor
    const baseSL = 0.5 + (1 - indication.profit_factor) * 0.5

    return {
      strategy: "trailing",
      category: "additional",
      side: direction,
      entry_price: indication.value,
      takeprofit_factor: baseTP,
      stoploss_ratio: baseSL,
      profit_factor: indication.profit_factor * 1.2,
      trailing_enabled: true,
      trail_start: 1.0,
      trail_stop: 0.5,
    }
  }

  private evaluateBlockStrategy(indication: any, settings: any): any {
    const direction = indication.metadata?.direction || "long"
    const confidenceFactor = indication.confidence / 100

    return {
      strategy: "block",
      category: "adjust",
      side: direction,
      entry_price: indication.value,
      takeprofit_factor: 1.2 + confidenceFactor,
      stoploss_ratio: 0.8 - confidenceFactor * 0.3,
      profit_factor: indication.profit_factor * (0.8 + confidenceFactor * 0.4),
      trailing_enabled: false,
      block_size: Math.ceil(confidenceFactor * 5),
    }
  }

  private evaluateDCAStrategy(indication: any, settings: any): any {
    const direction = indication.metadata?.direction || "long"

    return {
      strategy: "dca",
      category: "adjust",
      side: direction,
      entry_price: indication.value,
      takeprofit_factor: 2.0,
      stoploss_ratio: 1.5,
      profit_factor: indication.profit_factor * 0.9,
      trailing_enabled: false,
      dca_levels: 3,
      dca_spacing: 2.0,
    }
  }

  /**
   * Create pseudo position in Redis
   */
  private async createPseudoPosition(
    symbol: string,
    indication: any,
    strategySignal: any,
    timestamp?: string,
  ): Promise<void> {
    try {
      const { createPosition } = await import("@/lib/redis-db")
      
      await createPosition(this.connectionId, {
        type: "pseudo",
        symbol,
        indication_type: indication.indication_type,
        side: strategySignal.side,
        entry_price: strategySignal.entry_price,
        current_price: strategySignal.entry_price,
        quantity: 1.0,
        position_cost: 0.1,
        takeprofit_factor: strategySignal.takeprofit_factor,
        stoploss_ratio: strategySignal.stoploss_ratio,
        profit_factor: strategySignal.profit_factor,
        trailing_enabled: strategySignal.trailing_enabled,
        opened_at: timestamp || new Date().toISOString(),
      })

      console.log(`[v0] Created pseudo position for ${symbol}`)
    } catch (error) {
      console.error(`[v0] Failed to create pseudo position for ${symbol}:`, error)
    }
  }

  /**
   * Get active indications from Redis
   */
  private async getActiveIndications(symbol: string): Promise<any[]> {
    try {
      await initRedis()
      const indicationsKey = `indications:${this.connectionId}:${symbol}`
      const indications = await getSettings(indicationsKey)
      if (indications && Array.isArray(indications) && indications.length > 0) {
        return indications
      }
      // No indications yet - normal during startup, return silently
      return []
    } catch {
      return []
    }
  }

  /**
   * Get historical indications from Redis
   */
  private async getHistoricalIndications(symbol: string, start: Date, end: Date): Promise<any[]> {
    try {
      // For now, indications are not fully implemented in Redis
      // Return empty array to prevent spam queries
      console.log(`[v0] No historical indications for ${symbol}`)
      return []
    } catch (error) {
      console.error(`[v0] Failed to get historical indications for ${symbol}:`, error)
      return []
    }
  }

  /**
   * Get strategy settings from Redis
   */
  private async getStrategySettings(): Promise<any> {
    try {
      const settings = await getSettings("all_settings") || {}

      return {
        minProfitFactor: settings.strategyMinProfitFactor || 0.5,
        trailingEnabled: settings.trailingEnabled !== false,
        dcaEnabled: settings.dcaEnabled !== false,
        blockEnabled: settings.blockEnabled !== false,
      }
    } catch (error) {
      console.error("[v0] Failed to get strategy settings:", error)
      return { minProfitFactor: 0.5, trailingEnabled: true, dcaEnabled: true, blockEnabled: true }
    }
  }
}
