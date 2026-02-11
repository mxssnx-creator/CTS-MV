/**
 * Strategy Processor
 * Processes strategies asynchronously for symbols
 */

import { initRedis, getIndications, getSettings } from "@/lib/redis-db"

export class StrategyProcessor {
  private connectionId: string
  private strategyCache: Map<string, { signal: any; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 60000 // 60 seconds

  constructor(connectionId: string) {
    this.connectionId = connectionId
  }

  /**
   * Process strategy for a symbol in real-time
   */
  async processStrategy(symbol: string): Promise<void> {
    try {
      console.log(`[v0] Processing strategy for ${symbol}`)

      await initRedis()
      const indications = await this.getActiveIndications(symbol)

      if (indications.length === 0) {
        return
      }

      const settings = await this.getStrategySettings()

      const batchSize = 5
      for (let i = 0; i < indications.length; i += batchSize) {
        const batch = indications.slice(i, i + batchSize)

        await Promise.all(
          batch.map(async (indication) => {
            const strategySignal = await this.evaluateStrategy(symbol, indication, settings)

            if (strategySignal && strategySignal.profit_factor >= settings.minProfitFactor) {
              await this.createPseudoPosition(symbol, indication, strategySignal)
            }
          }),
        )
      }
    } catch (error) {
      console.error(`[v0] Failed to process strategy for ${symbol}:`, error)
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
      const allIndications = await getIndications(this.connectionId, symbol)
      
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      
      return allIndications
        .filter((ind) => ind.calculated_at > oneHourAgo && parseFloat(ind.profit_factor) >= 0.5)
        .sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))
        .slice(0, 10)
    } catch (error) {
      console.error(`[v0] Failed to get active indications for ${symbol}:`, error)
      return []
    }
  }

  /**
   * Get historical indications from Redis
   */
  private async getHistoricalIndications(symbol: string, start: Date, end: Date): Promise<any[]> {
    try {
      const allIndications = await getIndications(this.connectionId, symbol)
      
      return allIndications
        .filter((ind) => 
          ind.calculated_at >= start.toISOString() && 
          ind.calculated_at <= end.toISOString()
        )
        .sort((a, b) => a.calculated_at.localeCompare(b.calculated_at))
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
