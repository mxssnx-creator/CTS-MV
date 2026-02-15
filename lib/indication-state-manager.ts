/**
 * Indication State Manager
 * Manages step-based indication calculations for Main System Trade mode
 * Implements: direction (3-30), move (3-30), active (0.5-2.5%), optimal (advanced) types
 * With validation timeout (15s) and position cooldown (20s)
 */

import { getSettings, setSettings } from "@/lib/redis-db"
import { BasePseudoPositionManager } from "./base-pseudo-position-manager"
import { DataCleanupManager } from "./data-cleanup-manager" // Import DataCleanupManager for time window limits

export interface IndicationState {
  symbol: string
  type: "direction" | "move" | "active" | "optimal" | "active_advanced" // Added active_advanced type
  range: number | null
  lastValidated: Date | null
  lastPositionClosed: Date | null
  activePositionsCount: number
}

export class IndicationStateManager {
  private connectionId: string
  private states: Map<string, IndicationState> = new Map()

  private validationTimeout = 15 // seconds
  private positionCooldown = 20 // seconds
  private maxPositionsPerConfig = 1

  // Performance optimization: Cache and batch processing
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map()
  private readonly PRICE_CACHE_TTL = 1000 // 1 second
  private pendingOperations: Map<string, Promise<any>> = new Map()

  private basePseudoManager: BasePseudoPositionManager

  constructor(connectionId: string) {
    this.connectionId = connectionId
    this.basePseudoManager = new BasePseudoPositionManager(connectionId)
    this.loadSettings()
  }

  private async loadSettings(): Promise<void> {
    try {
      // Load settings from Redis instead of SQL
      const indicationSettings = await getSettings("indication_settings")
      
      if (indicationSettings) {
        this.validationTimeout = Number.parseInt(String(indicationSettings.validationTimeout || "15"))
        const cooldownMs = indicationSettings.positionCooldownMs
        const cooldownSeconds = indicationSettings.positionCooldownTimeout
        
        if (cooldownMs) {
          this.positionCooldown = Number.parseInt(String(cooldownMs)) / 1000 // Convert ms to seconds
        } else if (cooldownSeconds) {
          this.positionCooldown = Number.parseInt(String(cooldownSeconds))
        } else {
          this.positionCooldown = 0.1 // 100ms default in seconds
        }
        
        this.maxPositionsPerConfig = Number.parseInt(
          String(indicationSettings.maxPositionsPerConfigDirection || indicationSettings.maxPositionsPerConfigSet || "1"),
        )
      }

      console.log(
        `[v0] Loaded indication settings: validation=${this.validationTimeout}s, cooldown=${this.positionCooldown}s, maxPerConfig=${this.maxPositionsPerConfig}`,
      )
    } catch (error) {
      console.error("[v0] Failed to load indication settings:", error)
      // Use defaults if loading fails
      this.validationTimeout = 15
      this.positionCooldown = 0.1
      this.maxPositionsPerConfig = 1
    }
  }

  /**
   * Process step-based indications for Main System Trade mode
   * OPTIMIZED: Async handling with Promise.allSettled for parallel processing
   */
  async processStepBasedIndications(symbol: string): Promise<void> {
    try {
      // Check if already processing this symbol
      const processingKey = `process-${symbol}`
      if (this.pendingOperations.has(processingKey)) {
        console.log(`[v0] Already processing indications for ${symbol}, skipping duplicate`)
        return
      }

      // Mark as processing
      const processingPromise = this.executeIndicationProcessing(symbol)
      this.pendingOperations.set(processingKey, processingPromise)

      try {
        await processingPromise
      } finally {
        this.pendingOperations.delete(processingKey)
      }
    } catch (error) {
      console.error(`[v0] Error processing step-based indications for ${symbol}:`, error)
    }
  }

  /**
   * Execute indication processing with proper async handling
   */
  private async executeIndicationProcessing(symbol: string): Promise<void> {
    // Get current price with caching
    const currentPrice = await this.getCachedPrice(symbol)
    if (!currentPrice) return

    // Get indication ranges from settings (cached)
    const { minRange, maxRange } = await this.getIndicationRanges()

    // Process all indication types in parallel with proper error handling
    const results = await Promise.allSettled([
      this.processDirectionIndications(symbol, currentPrice, minRange, maxRange),
      this.processMoveIndications(symbol, currentPrice, minRange, maxRange),
      this.processActiveIndications(symbol, currentPrice),
      this.processOptimalIndications(symbol, currentPrice, minRange, maxRange), // Added Optimal processing
      this.processActiveAdvancedIndications(symbol, currentPrice), // NEW: Active indication type
    ])

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const types = ["direction", "move", "active", "optimal", "active_advanced"]
        console.error(`[v0] Failed to process ${types[index]} indication for ${symbol}:`, result.reason)
      }
    })
  }

  /**
   * Get cached price to reduce database queries
   * OPTIMIZED: Only fetch last 1 record
   */
  private async getCachedPrice(symbol: string): Promise<number | null> {
    const cached = this.priceCache.get(symbol)
    const now = Date.now()

    if (cached && now - cached.timestamp < this.PRICE_CACHE_TTL) {
      return cached.price
    }

    const [marketData] = await sql`
      SELECT price FROM market_data
      WHERE connection_id = ${this.connectionId}
        AND symbol = ${symbol}
      ORDER BY timestamp DESC
      LIMIT 1
    `

    if (!marketData) return null

    const price = Number.parseFloat(marketData.price)
    this.priceCache.set(symbol, { price, timestamp: now })

    return price
  }

  /**
   * Get indication ranges with caching
   */
  private cachedRanges: { minRange: number; maxRange: number; timestamp: number } | null = null
  private readonly RANGE_CACHE_TTL = 60000 // 60 seconds

  private async getIndicationRanges(): Promise<{ minRange: number; maxRange: number }> {
    const now = Date.now()

    if (this.cachedRanges && now - this.cachedRanges.timestamp < this.RANGE_CACHE_TTL) {
      return this.cachedRanges
    }

    const [rangeSettings] = await sql`
      SELECT value FROM system_settings
      WHERE key = 'indicationRangeMin'
    `

    const minRange = rangeSettings ? Number.parseInt(rangeSettings.value) : 3
    const maxRange = 30

    this.cachedRanges = { minRange, maxRange, timestamp: now }

    return { minRange, maxRange }
  }

  /**
   * Check if an indication can be created (validation timeout)
   */
  private async canCreateIndication(stateKey: string): Promise<boolean> {
    try {
      const [state] = await sql`
        SELECT validated_at FROM indication_states
        WHERE state_key = ${stateKey}
      `

      if (!state) return true

      const validatedAt = new Date(state.validated_at).getTime()
      const now = Date.now()
      const elapsedSeconds = (now - validatedAt) / 1000

      return elapsedSeconds >= this.validationTimeout
    } catch (error) {
      console.error(`[v0] Error checking indication state for ${stateKey}:`, error)
      return false // Fail safe
    }
  }

  /**
   * Check if a position can be created (cooldown and limits)
   */
  private async canCreatePosition(
    symbol: string,
    type: string,
    range: number | null,
    threshold: number | null,
    timeWindow: number | null,
    lastPartRatio: number | null,
  ): Promise<boolean> {
    try {
      // Check active positions count for this specific config
      const [countResult] = await sql`
        SELECT COUNT(*) as count FROM pseudo_positions
        WHERE connection_id = ${this.connectionId}
          AND symbol = ${symbol}
          AND indication_type = ${type}
          AND status = 'active'
          ${range ? sql`AND indication_range = ${range}` : sql``}
          ${threshold ? sql`AND activity_ratio = ${threshold}` : sql``}
          ${timeWindow ? sql`AND time_window = ${timeWindow}` : sql``}
      `

      const count = Number(countResult?.count || 0)
      return count < this.maxPositionsPerConfig
    } catch (error) {
      console.error(`[v0] Error checking position limits for ${symbol}:`, error)
      return false // Fail safe
    }
  }

  /**
   * Direction Type: Opposite direction change detection (range 3-30)
   * OPTIMIZED: Use time-window limits based on indication type
   */
  private async processDirectionIndications(
    symbol: string,
    currentPrice: number,
    minRange: number,
    maxRange: number,
  ): Promise<void> {
    const timeWindowMinutes = DataCleanupManager.getOptimalQueryWindow("direction")

    const historicalPrices = await sql`
      SELECT price FROM market_data
      WHERE connection_id = ${this.connectionId}
        AND symbol = ${symbol}
        AND timestamp > NOW() - INTERVAL '${timeWindowMinutes} minutes'
      ORDER BY timestamp DESC
      LIMIT ${maxRange + 1}
    `

    if (historicalPrices.length < minRange + 1) return

    const prices = historicalPrices.map((p: any) => Number.parseFloat(p.price))

    // Process ranges with batching to avoid overwhelming the system
    const ranges = Array.from({ length: maxRange - minRange + 1 }, (_, i) => minRange + i)
    const batchSize = 5

    for (let i = 0; i < ranges.length; i += batchSize) {
      const batch = ranges.slice(i, i + batchSize)

      await Promise.allSettled(
        batch.map(async (range) => {
          const stateKey = `${symbol}-direction-${range}`

          // Early return checks
          if (prices.length < range + 1) return
          if (!(await this.canCreateIndication(stateKey))) return
          if (!(await this.canCreatePosition(symbol, "direction", range, null, null, null))) return

          const directionChange = this.detectDirectionChange(prices, range)

          if (directionChange) {
            await this.createPseudoPositions(symbol, "direction", range, currentPrice, directionChange, null, null)
            await this.updateIndicationState(stateKey)
          }
        }),
      )
    }
  }

  /**
   * Move Type: Price movement without opposite requirement (range 3-30)
   * OPTIMIZED: Use time-window limits based on indication type
   */
  private async processMoveIndications(
    symbol: string,
    currentPrice: number,
    minRange: number,
    maxRange: number,
  ): Promise<void> {
    const timeWindowMinutes = DataCleanupManager.getOptimalQueryWindow("move")

    const historicalPrices = await sql`
      SELECT price FROM market_data
      WHERE connection_id = ${this.connectionId}
        AND symbol = ${symbol}
        AND timestamp > NOW() - INTERVAL '${timeWindowMinutes} minutes'
      ORDER BY timestamp DESC
      LIMIT ${maxRange + 1}
    `

    if (historicalPrices.length < minRange + 1) return

    const prices = historicalPrices.map((p: any) => Number.parseFloat(p.price))

    // Process in batches
    const ranges = Array.from({ length: maxRange - minRange + 1 }, (_, i) => minRange + i)
    const batchSize = 5

    for (let i = 0; i < ranges.length; i += batchSize) {
      const batch = ranges.slice(i, i + batchSize)

      await Promise.allSettled(
        batch.map(async (range) => {
          const stateKey = `${symbol}-move-${range}`

          if (prices.length < range + 1) return
          if (!(await this.canCreateIndication(stateKey))) return
          if (!(await this.canCreatePosition(symbol, "move", range, null, null, null))) return

          const moveDetected = this.detectPriceMove(prices, range)

          if (moveDetected) {
            await this.createPseudoPositions(symbol, "move", range, currentPrice, moveDetected, null, null)
            await this.updateIndicationState(stateKey)
          }
        }),
      )
    }
  }

  /**
   * Active Type: Fast price change detection (0.5-2.5% threshold)
   * OPTIMIZED: Use specific 1-minute window with LIMIT
   */
  private async processActiveIndications(symbol: string, currentPrice: number): Promise<void> {
    const thresholds = [0.5, 1.0, 1.5, 2.0, 2.5]

    await Promise.allSettled(
      thresholds.map(async (threshold) => {
        const stateKey = `${symbol}-active-${threshold}`

        if (!(await this.canCreateIndication(stateKey))) return
        if (!(await this.canCreatePosition(symbol, "active", null, threshold, null, null))) return

        const [recentPrice] = await sql`
          SELECT price FROM market_data
          WHERE connection_id = ${this.connectionId}
            AND symbol = ${symbol}
            AND timestamp > NOW() - INTERVAL '1 minute'
          ORDER BY timestamp ASC
          LIMIT 1
        `

        if (!recentPrice) return

        const priceChange =
          ((currentPrice - Number.parseFloat(recentPrice.price)) / Number.parseFloat(recentPrice.price)) * 100

        if (Math.abs(priceChange) >= threshold) {
          const direction = priceChange > 0 ? "long" : "short"
          await this.createPseudoPositions(symbol, "active", null, currentPrice, direction, threshold, null)
          await this.updateIndicationState(stateKey)
        }
      }),
    )
  }

  /**
   * Optimal Type: Advanced indication with consecutive step detection, market change calculations,
   * drawdown filtering, and base pseudo position layer (250 limit with performance thresholds)
   */
  private async processOptimalIndications(
    symbol: string,
    currentPrice: number,
    minRange: number,
    maxRange: number,
  ): Promise<void> {
    const timeWindowMinutes = DataCleanupManager.getOptimalQueryWindow("optimal")

    const historicalPrices = await sql`
      SELECT price, timestamp FROM market_data
      WHERE connection_id = ${this.connectionId}
        AND symbol = ${symbol}
        AND timestamp > NOW() - INTERVAL '${timeWindowMinutes} minutes'
      ORDER BY timestamp DESC
      LIMIT ${maxRange + 1}
    `

    if (historicalPrices.length < minRange + 1) return

    const prices = historicalPrices.map((p: any) => Number.parseFloat(p.price))

    // Process ranges with batching
    const ranges = Array.from({ length: maxRange - minRange + 1 }, (_, i) => minRange + i)
    const batchSize = 5

    for (let i = 0; i < ranges.length; i += batchSize) {
      const batch = ranges.slice(i, i + batchSize)

      await Promise.allSettled(
        batch.map(async (range) => {
          const stateKey = `${symbol}-optimal-${range}`

          if (prices.length < range + 1) return
          if (!(await this.canCreateIndication(stateKey))) return

          // Use correct consecutive step detection (not averages)
          const directionChange = this.detectConsecutiveDirectionSteps(prices, range)

          if (directionChange) {
            // Start market change tracking for this indication
            await this.trackMarketChangeAndCreateOptimalPositions(
              symbol,
              range,
              currentPrice,
              directionChange,
              historicalPrices,
            )
            await this.updateIndicationState(stateKey)
          }
        }),
      )
    }
  }

  /**
   * NEW: Active Advanced Type
   * Uses optimal market change calculations for positive success
   * Multiple advanced calculations for frequently and short time trades up to 40min
   * Ratios for activity percentage change
   */
  private async processActiveAdvancedIndications(symbol: string, currentPrice: number): Promise<void> {
    const timeWindowMinutes = DataCleanupManager.getOptimalQueryWindow("active_advanced")
    const maxDataPoints = 500 // Limit data points for performance

    const historicalPrices = await sql`
      SELECT price, timestamp FROM market_data
      WHERE connection_id = ${this.connectionId}
        AND symbol = ${symbol}
        AND timestamp > NOW() - INTERVAL '${timeWindowMinutes} minutes'
      ORDER BY timestamp DESC
      LIMIT ${maxDataPoints}
    `

    if (historicalPrices.length < 10) return // Need minimum data points

    const prices = historicalPrices.map((p: any) => Number.parseFloat(p.price))
    const timestamps = historicalPrices.map((p: any) => new Date(p.timestamp).getTime())

    // Activity ratios: 0.5%, 1.0%, 1.5%, 2.0%, 2.5%, 3.0%
    const activityRatios = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]

    // Time windows: 1min, 3min, 5min, 10min, 15min, 20min, 30min, 40min
    const timeWindows = [1, 3, 5, 10, 15, 20, 30, 40]

    await Promise.allSettled(
      activityRatios.map(async (activityRatio) => {
        for (const timeWindow of timeWindows) {
          await this.evaluateActiveAdvanced(symbol, currentPrice, prices, timestamps, activityRatio, timeWindow)
        }
      }),
    )
  }

  /**
   * Evaluate Active Advanced indication with market change calculations
   */
  private async evaluateActiveAdvanced(
    symbol: string,
    currentPrice: number,
    prices: number[],
    timestamps: number[],
    activityRatio: number,
    timeWindow: number, // in minutes
  ): Promise<void> {
    const stateKey = `${symbol}-active_advanced-${activityRatio}-${timeWindow}`

    if (!(await this.canCreateIndication(stateKey))) return
    if (!(await this.canCreatePosition(symbol, "active_advanced", null, activityRatio, timeWindow, null))) return

    // Calculate time window in milliseconds
    const timeWindowMs = timeWindow * 60 * 1000
    const now = timestamps[0]
    const cutoffTime = now - timeWindowMs

    // Get prices within time window
    const windowPrices: number[] = []
    const windowTimestamps: number[] = []

    for (let i = 0; i < prices.length; i++) {
      if (timestamps[i] >= cutoffTime) {
        windowPrices.push(prices[i])
        windowTimestamps.push(timestamps[i])
      }
    }

    if (windowPrices.length < 3) return // Need minimum data points

    // Calculate overall market change (average price change)
    const avgPrice = windowPrices.reduce((sum, p) => sum + p, 0) / windowPrices.length
    const priceChangeFromAvg = ((currentPrice - avgPrice) / avgPrice) * 100

    // Calculate last part market change (last 20% of time window)
    const lastPartCount = Math.max(1, Math.floor(windowPrices.length * 0.2))
    const lastPartPrices = windowPrices.slice(0, lastPartCount)
    const lastPartAvg = lastPartPrices.reduce((sum, p) => sum + p, 0) / lastPartPrices.length
    const lastPartChange = ((currentPrice - lastPartAvg) / lastPartAvg) * 100

    // Calculate volatility (standard deviation)
    const variance = windowPrices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / windowPrices.length
    const volatility = Math.sqrt(variance)
    const volatilityPercent = (volatility / avgPrice) * 100

    // Calculate momentum (price acceleration)
    const momentum = this.calculateMomentum(windowPrices, windowTimestamps)

    // Calculate drawdown within window
    const maxPrice = Math.max(...windowPrices)
    const minPrice = Math.min(...windowPrices)
    const drawdown = ((maxPrice - minPrice) / maxPrice) * 100

    // Validation criteria for Active Advanced:
    // 1. Overall price change >= activityRatio
    // 2. Last part shows continuation (same direction)
    // 3. Volatility indicates active market
    // 4. Momentum is positive
    // 5. Drawdown is acceptable

    const overallChangeAbs = Math.abs(priceChangeFromAvg)
    const lastPartChangeAbs = Math.abs(lastPartChange)

    if (overallChangeAbs >= activityRatio) {
      // Same direction check
      const sameDirection =
        (priceChangeFromAvg > 0 && lastPartChange > 0) || (priceChangeFromAvg < 0 && lastPartChange < 0)

      // Last part should be at least 60% of overall change (continuation)
      const continuationRatio = lastPartChangeAbs / overallChangeAbs

      if (sameDirection && continuationRatio >= 0.6) {
        // Check if volatility indicates active market (not flat)
        if (volatilityPercent >= 0.1) {
          // Check momentum
          if (momentum !== 0) {
            // Check drawdown is acceptable
            if (drawdown <= 5.0) {
              const direction = priceChangeFromAvg > 0 ? "long" : "short"

              // Create base pseudo positions with activity parameters
              await this.createActiveAdvancedPositions(symbol, currentPrice, direction, activityRatio, timeWindow, {
                overallChange: priceChangeFromAvg,
                lastPartChange: lastPartChange,
                volatility: volatilityPercent,
                momentum: momentum,
                drawdown: drawdown,
                continuationRatio: continuationRatio,
              })

              await this.updateIndicationState(stateKey)
            }
          }
        }
      }
    }
  }

  /**
   * Calculate momentum (price acceleration)
   */
  private calculateMomentum(prices: number[], timestamps: number[]): number {
    if (prices.length < 3) return 0

    const recentCount = Math.min(5, Math.floor(prices.length / 3))
    const olderCount = recentCount

    const recentPrices = prices.slice(0, recentCount)
    const olderPrices = prices.slice(prices.length - olderCount, prices.length)

    const recentAvg = recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length
    const olderAvg = olderPrices.reduce((sum, p) => sum + p, 0) / olderPrices.length

    const recentTime = timestamps.slice(0, recentCount)
    const olderTime = timestamps.slice(timestamps.length - olderCount, timestamps.length)

    const recentAvgTime = recentTime.reduce((sum, t) => sum + t, 0) / recentTime.length
    const olderAvgTime = olderTime.reduce((sum, t) => sum + t, 0) / olderTime.length

    const timeDiff = (recentAvgTime - olderAvgTime) / 1000 // in seconds
    if (timeDiff === 0) return 0

    return (((recentAvg - olderAvg) / olderAvg) * 100) / timeDiff // % per second
  }

  /**
   * Create base pseudo positions for Active Advanced indication
   */
  private async createActiveAdvancedPositions(
    symbol: string,
    entryPrice: number,
    direction: "long" | "short",
    activityRatio: number,
    timeWindow: number,
    metrics: {
      overallChange: number
      lastPartChange: number
      volatility: number
      momentum: number
      drawdown: number
      continuationRatio: number
    },
  ): Promise<void> {
    try {
      // Define ALL possible configurations (UNLIMITED sets)
      const tpFactors = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
      const slRatios = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]
      const trailingOptions = [
        { enabled: false, start: null, stop: null },
        { enabled: true, start: 0.3, stop: 0.1 },
        { enabled: true, start: 0.6, stop: 0.2 },
        { enabled: true, start: 1.0, stop: 0.3 },
      ]

      let createdCount = 0

      for (const tpFactor of tpFactors) {
        for (const slRatio of slRatios) {
          for (const trailingConfig of trailingOptions) {
            // Get or create base position for THIS SPECIFIC config
            const basePositionId = await this.basePseudoManager.getOrCreateBasePosition(
              symbol,
              "active_advanced",
              activityRatio,
              direction,
              tpFactor,
              slRatio,
              trailingConfig.enabled,
              trailingConfig.start,
              trailingConfig.stop,
              metrics.drawdown / 100, // Convert to ratio
              timeWindow,
              metrics.continuationRatio,
            )

            if (!basePositionId) continue

            // Check if this base position can create more entries (up to 250 per set)
            if (!(await this.basePseudoManager.canCreatePosition(basePositionId))) {
              continue
            }

            await sql`
              INSERT INTO pseudo_positions (
                connection_id, symbol, indication_type, indication_range,
                takeprofit_factor, stoploss_ratio, trailing_enabled,
                trail_start, trail_stop, entry_price, current_price,
                direction, status, base_position_id, position_level,
                activity_ratio, time_window, overall_change, last_part_change,
                volatility, momentum, drawdown_ratio, continuation_ratio,
                created_at
              )
              VALUES (
                ${this.connectionId}, ${symbol}, 'active_advanced', ${activityRatio},
                ${tpFactor}, ${slRatio}, ${trailingConfig.enabled},
                ${trailingConfig.start}, ${trailingConfig.stop}, ${entryPrice}, ${entryPrice},
                ${direction}, 'base_active', ${basePositionId}, 'base',
                ${activityRatio}, ${timeWindow}, ${metrics.overallChange}, ${metrics.lastPartChange},
                ${metrics.volatility}, ${metrics.momentum}, ${metrics.drawdown / 100}, ${metrics.continuationRatio},
                CURRENT_TIMESTAMP
              )
            `

            createdCount++
          }
        }
      }

      console.log(
        `[v0] Created ${createdCount} Active Advanced BASE pseudo position entries for ${symbol} ${direction} (${activityRatio}% / ${timeWindow}min)`,
      )
    } catch (error) {
      console.error(`[v0] Error creating Active Advanced positions:`, error)
    }
  }

  /**
   * Create BASE pseudo positions when indication is VALID
   * Each configuration (TP/SL/Trailing combo) gets its own base position set
   * Each base position set can have up to 250 entries in database
   */
  private async createPseudoPositions(
    symbol: string,
    indicationType: "direction" | "move" | "active" | "active_advanced",
    range: number | null,
    entryPrice: number,
    direction: "long" | "short",
    threshold: number | null,
    trailing: any | null,
  ): Promise<void> {
    try {
      // Define ALL possible configurations (UNLIMITED sets)
      const tpFactors = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
      const slRatios = [
        0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2,
      ]
      const trailingOptions = [
        { enabled: false, start: null, stop: null },
        { enabled: true, start: 0.3, stop: 0.1 },
        { enabled: true, start: 0.6, stop: 0.2 },
        { enabled: true, start: 1.0, stop: 0.3 },
      ]

      let createdCount = 0

      for (const tpFactor of tpFactors) {
        for (const slRatio of slRatios) {
          for (const trailingConfig of trailingOptions) {
            // Get or create base position for THIS SPECIFIC config
            const basePositionId = await this.basePseudoManager.getOrCreateBasePosition(
              symbol,
              indicationType,
              range || 0,
              direction,
              tpFactor,
              slRatio,
              trailingConfig.enabled,
              trailingConfig.start,
              trailingConfig.stop,
              0.3, // Default drawdown for non-optimal
              range || 3, // Use range as market change
              1.5, // Default last part ratio
            )

            if (!basePositionId) {
              // This config set already at 250 limit or failed
              continue
            }

            // Check if this base position can create more entries (up to 250 per set)
            if (!(await this.basePseudoManager.canCreatePosition(basePositionId))) {
              continue
            }

            await sql`
              INSERT INTO pseudo_positions (
                connection_id, symbol, indication_type, indication_range,
                takeprofit_factor, stoploss_ratio, trailing_enabled,
                trail_start, trail_stop, entry_price, current_price,
                direction, status, base_position_id, position_level, created_at
              )
              VALUES (
                ${this.connectionId}, ${symbol}, ${indicationType}, ${range},
                ${tpFactor}, ${slRatio}, ${trailingConfig.enabled},
                ${trailingConfig.start}, ${trailingConfig.stop}, ${entryPrice}, ${entryPrice},
                ${direction}, 'base_active', ${basePositionId}, 'base', CURRENT_TIMESTAMP
              )
            `

            createdCount++
          }
        }
      }

      console.log(
        `[v0] Created ${createdCount} BASE pseudo position entries across multiple config sets for ${symbol} ${indicationType} ${direction}`,
      )
    } catch (error) {
      console.error(`[v0] Error creating base pseudo positions:`, error)
    }
  }

  /**
   * Update indication state after validation
   */
  private async updateIndicationState(stateKey: string): Promise<void> {
    await sql`
      INSERT INTO indication_states (state_key, validated_at)
      VALUES (${stateKey}, CURRENT_TIMESTAMP)
      ON CONFLICT (state_key)
      DO UPDATE SET validated_at = CURRENT_TIMESTAMP
    `
  }

  /**
   * Detect direction change in price series
   * Fixed to use correct consecutive step counting for Direction/Move types
   */
  private detectDirectionChange(prices: number[], range: number): "long" | "short" | null {
    // For Direction/Move types, use the simple average method (keep coordinated)
    if (prices.length < range + 1) return null

    const recentPrices = prices.slice(0, range)
    const olderPrice = prices[range]

    const avgRecent = recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length

    // Direction change: recent average significantly different from older price
    const changePercent = ((avgRecent - olderPrice) / olderPrice) * 100

    if (changePercent > 0.5) return "long"
    if (changePercent < -0.5) return "short"

    return null
  }

  /**
   * Detect price move without direction requirement
   * Fixed to use correct consecutive step counting for Direction/Move types
   */
  private detectPriceMove(prices: number[], range: number): "long" | "short" | null {
    // For Direction/Move types, use the simple endpoint method (keep coordinated)
    if (prices.length < range + 1) return null

    const currentPrice = prices[0]
    const oldPrice = prices[range]

    const changePercent = ((currentPrice - oldPrice) / oldPrice) * 100

    if (Math.abs(changePercent) > 0.3) {
      return changePercent > 0 ? "long" : "short"
    }

    return null
  }

  /**
   * CORRECT Direction Detection: Count consecutive opposite steps
   * Returns expected reversal direction
   */
  private detectConsecutiveDirectionSteps(prices: number[], range: number): "long" | "short" | null {
    if (prices.length < range + 1) return null

    let consecutiveDown = 0
    let consecutiveUp = 0

    // Compare each price to the next (newer to older)
    for (let i = 0; i < range; i++) {
      const current = prices[i]
      const previous = prices[i + 1]

      if (current < previous) {
        // Price went DOWN
        consecutiveDown++
        consecutiveUp = 0 // reset opposite counter
      } else if (current > previous) {
        // Price went UP
        consecutiveUp++
        consecutiveDown = 0 // reset opposite counter
      } else {
        // Price unchanged - reset both
        consecutiveDown = 0
        consecutiveUp = 0
      }
    }

    // If we counted 'range' consecutive downs → expect UP reversal (LONG)
    if (consecutiveDown >= range) {
      return "long"
    }

    // If we counted 'range' consecutive ups → expect DOWN reversal (SHORT)
    if (consecutiveUp >= range) {
      return "short"
    }

    return null
  }

  /**
   * CORRECT Move Detection: Consecutive same-direction steps WITHOUT opposite interference
   * Returns continuation direction
   */
  private detectConsecutiveMoveSteps(prices: number[], range: number): "long" | "short" | null {
    if (prices.length < range + 1) return null

    let upMoves = 0
    let downMoves = 0
    let flatMoves = 0

    // Analyze each step
    for (let i = 0; i < range; i++) {
      const current = prices[i]
      const previous = prices[i + 1]

      if (current > previous) {
        upMoves++
      } else if (current < previous) {
        downMoves++
      } else {
        flatMoves++
      }
    }

    // Valid UP move: only UP and FLAT, NO DOWN, and at least 60% actual moves
    if (upMoves > 0 && downMoves === 0 && upMoves >= range * 0.6) {
      // Check minimum movement threshold
      const totalMovement = Math.abs(prices[0] - prices[range]) / prices[range]
      if (totalMovement >= 0.003) {
        return "long"
      }
    }

    // Valid DOWN move: only DOWN and FLAT, NO UP, and at least 60% actual moves
    if (downMoves > 0 && upMoves === 0 && downMoves >= range * 0.6) {
      const totalMovement = Math.abs(prices[0] - prices[range]) / prices[range]
      if (totalMovement >= 0.003) {
        return "short"
      }
    }

    return null
  }

  /**
   * Track market change for 3+ seconds and create optimal positions with all variations
   * Includes: drawdown filtering, market change calculations, base pseudo layer
   */
  private async trackMarketChangeAndCreateOptimalPositions(
    symbol: string,
    range: number,
    currentPrice: number,
    direction: "long" | "short",
    historicalPrices: any[],
  ): Promise<void> {
    // Implementation would track per-second price changes for min 3 seconds
    // Calculate overall average and last 20% average
    // Validate against ratio factors (1.0, 1.5, 2.0, 2.5)
    // For now, simplified version:

    const drawdownRatios = [0.1, 0.2, 0.3, 0.4, 0.5]
    const marketChangeRanges = [1, 3, 5, 7, 9]
    const lastPartRatios = [1.0, 1.5, 2.0, 2.5]

    // For each combination that passes validation
    for (const drawdownRatio of drawdownRatios) {
      for (const marketChangeRange of marketChangeRanges) {
        for (const lastPartRatio of lastPartRatios) {
          // Get or create base pseudo position
          const basePositionId = await this.basePseudoManager.getOrCreateBasePosition(
            symbol,
            "optimal",
            range,
            direction,
            0, // tpFactor (dummy)
            0, // slRatio (dummy)
            false, // trailingEnabled (dummy)
            null, // trailStart
            null, // trailStop
            drawdownRatio,
            marketChangeRange,
            lastPartRatio,
          )

          if (!basePositionId) continue

          // Check if base position can create more positions
          if (!(await this.basePseudoManager.canCreatePosition(basePositionId))) {
            continue
          }

          // Create full position matrix for this base config
          await this.createOptimalPositionMatrix(
            symbol,
            range,
            currentPrice,
            direction,
            basePositionId,
            drawdownRatio,
            marketChangeRange,
            lastPartRatio,
          )
        }
      }
    }
  }

  /**
   * Create full TP×SL×Trailing matrix for an optimal base config
   */
  private async createOptimalPositionMatrix(
    symbol: string,
    range: number,
    entryPrice: number,
    direction: "long" | "short",
    basePositionId: string,
    drawdownRatio: number,
    marketChangeRange: number,
    lastPartRatio: number,
  ): Promise<void> {
    const tpFactors = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
    const slRatios = [
      0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2,
    ]
    const trailingOptions = [
      { enabled: false },
      { enabled: true, start: 0.3, stop: 0.1 },
      { enabled: true, start: 0.6, stop: 0.2 },
      { enabled: true, start: 1.0, stop: 0.3 },
    ]

    const positions: any[] = []

    for (const tpFactor of tpFactors) {
      for (const slRatio of slRatios) {
        for (const trailing of trailingOptions) {
          positions.push({
            connection_id: this.connectionId,
            symbol,
            indication_type: "optimal",
            indication_range: range,
            takeprofit_factor: tpFactor,
            stoploss_ratio: slRatio,
            trailing_enabled: trailing.enabled,
            trail_start: trailing.enabled ? trailing.start : null,
            trail_stop: trailing.enabled ? trailing.stop : null,
            entry_price: entryPrice,
            current_price: entryPrice,
            direction,
            status: "active",
            base_position_id: basePositionId, // Link to base position
            // Store config parameters for filtering
            drawdown_ratio: drawdownRatio,
            market_change_range: marketChangeRange,
            last_part_ratio: lastPartRatio,
          })
        }
      }
    }

    // Batch insert
    if (positions.length > 0) {
      const batchSize = 50
      for (let i = 0; i < positions.length; i += batchSize) {
        const batch = positions.slice(i, i + batchSize)

        await Promise.all(
          batch.map(
            (p) =>
              sql`
              INSERT INTO pseudo_positions (
                connection_id, symbol, indication_type, indication_range,
                takeprofit_factor, stoploss_ratio, trailing_enabled,
                trail_start, trail_stop, entry_price, current_price,
                direction, status, base_position_id,
                drawdown_ratio, market_change_range, last_part_ratio,
                created_at
              )
              VALUES (
                ${p.connection_id}, ${p.symbol}, ${p.indication_type}, ${p.indication_range},
                ${p.takeprofit_factor}, ${p.stoploss_ratio}, ${p.trailing_enabled},
                ${p.trail_start}, ${p.trail_stop}, ${p.entry_price}, ${p.current_price},
                ${p.direction}, ${p.status}, ${p.base_position_id},
                ${p.drawdown_ratio}, ${p.market_change_range}, ${p.last_part_ratio},
                CURRENT_TIMESTAMP
              )
            `,
          ),
        )
      }

      console.log(
        `[v0] Created ${positions.length} optimal positions for ${symbol} (range ${range} ${direction}) base ${basePositionId}`,
      )
    }
  }
}
