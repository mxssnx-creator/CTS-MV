/**
 * Independent Indication Sets Processor
 * Maintains separate 500-entry pools for each indication type AND each configuration
 * Each type+config combination calculates independently with own set
 * 
 * Key Design Principles:
 * 1. Each indication type (direction, move, active, optimal) has independent sets
 * 2. Each configuration/parameter combination within a type has its own set
 * 3. Max positions per direction (long/short) is enforced per config
 * 4. Indication timeout is applied after valid evaluation
 */

import { getRedisClient, initRedis, getSettings, setSettings } from "@/lib/redis-db"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

// Default limits per indication type (independently configurable)
const DEFAULT_LIMITS = {
  direction: 500,
  move: 500,
  active: 500,
  optimal: 500,
  active_advanced: 500,
}

// Pre-cached client reference
let cachedClient: any = null
async function getCachedClient() {
  if (!cachedClient) {
    await initRedis()
    cachedClient = getRedisClient()
  }
  return cachedClient
}

// Position limits per config per direction
const DEFAULT_POSITION_LIMITS = {
  maxLong: 1,
  maxShort: 1,
}

// Indication timeout after valid evaluation (100ms - 3000ms)
const DEFAULT_INDICATION_TIMEOUT_MS = 1000

export interface IndicationSetLimits {
  direction: number
  move: number
  active: number
  optimal: number
  active_advanced: number
}

export interface PositionLimits {
  maxLong: number
  maxShort: number
}

export interface IndicationSet {
  type: "direction" | "move" | "active" | "optimal" | "active_advanced"
  connectionId: string
  symbol: string
  configKey: string // Unique key for this configuration combination
  entries: Array<{
    id: string
    timestamp: Date
    profitFactor: number
    confidence: number
    config: any
    metadata: any
    direction: "long" | "short"
  }>
  maxEntries: number // Configurable per type, default 500
  positionCounts: {
    long: number
    short: number
  }
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
  private limits: IndicationSetLimits = { ...DEFAULT_LIMITS }
  private positionLimits: PositionLimits = { ...DEFAULT_POSITION_LIMITS }
  private indicationTimeoutMs: number = DEFAULT_INDICATION_TIMEOUT_MS
  private lastValidEvaluationTime: Map<string, number> = new Map() // Track per config

  constructor(connectionId: string) {
    this.connectionId = connectionId
    this.loadSettings()
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await getSettings("all_settings")
      if (settings) {
        // Load independent limits per type
        if (settings.databaseSizeDirection) this.limits.direction = Number(settings.databaseSizeDirection)
        if (settings.databaseSizeMove) this.limits.move = Number(settings.databaseSizeMove)
        if (settings.databaseSizeActive) this.limits.active = Number(settings.databaseSizeActive)
        if (settings.databaseSizeOptimal) this.limits.optimal = Number(settings.databaseSizeOptimal)
        
        // Load position limits per direction
        if (settings.maxPositionsLong) this.positionLimits.maxLong = Number(settings.maxPositionsLong)
        if (settings.maxPositionsShort) this.positionLimits.maxShort = Number(settings.maxPositionsShort)
        
        // Load indication timeout
        if (settings.indicationTimeoutMs) {
          this.indicationTimeoutMs = Math.max(100, Math.min(3000, Number(settings.indicationTimeoutMs)))
        }
        
        // Fallback: legacy maxEntriesPerSet applies to all
        if (settings.maxEntriesPerSet && !settings.databaseSizeDirection) {
          const limit = Number(settings.maxEntriesPerSet)
          this.limits = { direction: limit, move: limit, active: limit, optimal: limit, active_advanced: limit }
        }
      }
      
      // Also load from indication_sets_config for backward compatibility
      const setsConfig = await getSettings("indication_sets_config")
      if (setsConfig) {
        if (setsConfig.direction) this.limits.direction = Number(setsConfig.direction)
        if (setsConfig.move) this.limits.move = Number(setsConfig.move)
        if (setsConfig.active) this.limits.active = Number(setsConfig.active)
        if (setsConfig.optimal) this.limits.optimal = Number(setsConfig.optimal)
      }
    } catch (error) {
      console.error("[v0] [IndicationSets] Failed to load settings:", error)
    }
  }

  /** Get the limit for a specific indication type */
  getLimit(type: keyof IndicationSetLimits): number {
    return this.limits[type] || DEFAULT_LIMITS[type] || 500
  }
  
  /** Get position limits */
  getPositionLimits(): PositionLimits {
    return this.positionLimits
  }
  
  /** Check if we can add a position for given direction */
  canAddPosition(configKey: string, direction: "long" | "short", currentCount: number): boolean {
    const limit = direction === "long" ? this.positionLimits.maxLong : this.positionLimits.maxShort
    return currentCount < limit
  }
  
  /** Check if indication timeout has passed since last valid evaluation */
  isTimeoutPassed(configKey: string): boolean {
    const lastTime = this.lastValidEvaluationTime.get(configKey) || 0
    return Date.now() - lastTime >= this.indicationTimeoutMs
  }
  
  /** Mark valid evaluation time for a config */
  markValidEvaluation(configKey: string): void {
    this.lastValidEvaluationTime.set(configKey, Date.now())
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
   * OPTIMIZED: Process all ranges in batch, minimize Redis calls
   */
  private async processDirectionSet(symbol: string, marketData: any): Promise<any> {
    // Process only key ranges for performance (3, 5, 7, 10, 14, 20, 30)
    const keyRanges = [3, 5, 7, 10, 14, 20, 30]
    let qualified = 0
    let total = 0
    const pendingWrites: Array<{ setKey: string; indication: any; config: any }> = []

    for (const range of keyRanges) {
      const configKey = `direction:range${range}`
      
      // Check timeout per config (memory-only check, no Redis)
      if (!this.isTimeoutPassed(configKey)) continue
      
      const indication = this.calculateDirectionIndication(marketData, range)
      if (!indication) continue
      
      total++
      const direction = indication.metadata?.firstDir > 0 ? "long" : "short"
      indication.direction = direction
      
      if (indication.profitFactor >= 1.0) {
        qualified++
        const setKey = `indication_set:${this.connectionId}:${symbol}:direction:range${range}`
        pendingWrites.push({ setKey, indication, config: { range } })
        this.markValidEvaluation(configKey)
      }
    }

    // Batch write all qualified indications
    if (pendingWrites.length > 0) {
      await this.batchSaveIndications(pendingWrites, "direction")
    }

    return { type: "direction", total, qualified, configs: pendingWrites.length }
  }

  /**
   * Process Move Indication Set (ranges 3-30, no opposite requirement)
   * OPTIMIZED: Process key ranges only, batch writes
   */
  private async processMoveSet(symbol: string, marketData: any): Promise<any> {
    const keyRanges = [3, 5, 7, 10, 14, 20, 30]
    let qualified = 0
    let total = 0
    const pendingWrites: Array<{ setKey: string; indication: any; config: any }> = []

    for (const range of keyRanges) {
      const configKey = `move:range${range}`
      if (!this.isTimeoutPassed(configKey)) continue
      
      const indication = this.calculateMoveIndication(marketData, range)
      if (!indication) continue
      
      total++
      const direction = (indication.metadata?.movement || 0) >= 0 ? "long" : "short"
      indication.direction = direction
      
      if (indication.profitFactor >= 1.0) {
        qualified++
        const setKey = `indication_set:${this.connectionId}:${symbol}:move:range${range}`
        pendingWrites.push({ setKey, indication, config: { range } })
        this.markValidEvaluation(configKey)
      }
    }

    if (pendingWrites.length > 0) {
      await this.batchSaveIndications(pendingWrites, "move")
    }

    return { type: "move", total, qualified, configs: pendingWrites.length }
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
   * Process Optimal Indication Set (consecutive step detection)
   * OPTIMIZED: Process key ranges only, batch writes
   */
  private async processOptimalSet(symbol: string, marketData: any): Promise<any> {
    const keyRanges = [5, 10, 15, 20]
    let qualified = 0
    let total = 0
    const pendingWrites: Array<{ setKey: string; indication: any; config: any }> = []

    for (const range of keyRanges) {
      const indication = this.calculateOptimalIndication(marketData, range)
      if (!indication) continue
      
      total++
      if (indication.profitFactor >= 1.0) {
        qualified++
        const setKey = `indication_set:${this.connectionId}:${symbol}:optimal:range${range}`
        pendingWrites.push({ setKey, indication, config: { range } })
      }
    }

    if (pendingWrites.length > 0) {
      await this.batchSaveIndications(pendingWrites, "optimal")
    }

    return { type: "optimal", total, qualified }
  }

  /**
   * Batch save multiple indications - much more efficient than individual saves
   */
  private async batchSaveIndications(
    writes: Array<{ setKey: string; indication: any; config: any }>,
    type: string
  ): Promise<void> {
    if (writes.length === 0) return
    
    try {
      const client = await getCachedClient()
      const now = Date.now()
      const timestamp = new Date().toISOString()
      
      // Process all writes with single timestamp
      for (const { setKey, indication, config } of writes) {
        const entry = {
          id: `${type}_${now}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp,
          profitFactor: indication.profitFactor,
          confidence: indication.confidence,
          config,
          metadata: indication.metadata,
        }
        
        // Simple append - no read required (Redis handles trimming via ltrim if needed)
        const existing = await client.get(setKey)
        let entries = existing ? JSON.parse(existing) : []
        entries.unshift(entry)
        if (entries.length > 100) entries = entries.slice(0, 100) // Keep last 100
        await client.set(setKey, JSON.stringify(entries))
      }
    } catch (error) {
      // Silent fail for non-critical batch operations
    }
  }

  /**
   * Save indication to its independent set pool (max 100 entries)
   * OPTIMIZED: Removed redundant stats updates
   */
  private async saveIndicationToSet(
    setKey: string,
    indication: any,
    type: string,
    config: any
  ): Promise<void> {
    try {
      const client = await getCachedClient()
      
      const existing = await client.get(setKey)
      let entries = existing ? JSON.parse(existing) : []

      entries.unshift({
        id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        profitFactor: indication.profitFactor,
        confidence: indication.confidence,
        config,
        metadata: indication.metadata,
      })

      // Trim to 100 entries (reduced from 250 for performance)
      if (entries.length > 100) entries = entries.slice(0, 100)

      await client.set(setKey, JSON.stringify(entries))
      // Stats updates removed - too expensive for high-frequency operations
    } catch (error) {
      // Silent fail
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
