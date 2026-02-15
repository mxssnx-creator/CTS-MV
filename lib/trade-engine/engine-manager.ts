/**
 * Trade Engine Manager
 * Manages asynchronous processing for symbols, indications, pseudo positions, and strategies
 */

import { getSettings, setSettings, getAllConnections } from "@/lib/redis-db"
import { DataSyncManager } from "@/lib/data-sync-manager"
import { IndicationProcessor } from "./indication-processor"
import { StrategyProcessor } from "./strategy-processor"
import { PseudoPositionManager } from "./pseudo-position-manager"
import { RealtimeProcessor } from "./realtime-processor"

export interface EngineConfig {
  connectionId: string
  indicationInterval: number // seconds
  strategyInterval: number // seconds
  realtimeInterval: number // seconds
}

export interface ComponentHealth {
  status: "healthy" | "degraded" | "unhealthy"
  lastCycleDuration: number
  errorCount: number
  successRate: number
}

export class TradeEngineManager {
  private connectionId: string
  private isRunning = false
  private indicationTimer?: NodeJS.Timeout
  private strategyTimer?: NodeJS.Timeout
  private realtimeTimer?: NodeJS.Timeout
  private healthCheckTimer?: NodeJS.Timeout

  private indicationProcessor: IndicationProcessor
  private strategyProcessor: StrategyProcessor
  private pseudoPositionManager: PseudoPositionManager
  private realtimeProcessor: RealtimeProcessor

  private componentHealth: {
    indications: ComponentHealth
    strategies: ComponentHealth
    realtime: ComponentHealth
  }

  constructor(config: EngineConfig) {
    this.connectionId = config.connectionId
    this.indicationProcessor = new IndicationProcessor(config.connectionId)
    this.strategyProcessor = new StrategyProcessor(config.connectionId)
    this.pseudoPositionManager = new PseudoPositionManager(config.connectionId)
    this.realtimeProcessor = new RealtimeProcessor(config.connectionId)

    this.componentHealth = {
      indications: { status: "healthy", lastCycleDuration: 0, errorCount: 0, successRate: 100 },
      strategies: { status: "healthy", lastCycleDuration: 0, errorCount: 0, successRate: 100 },
      realtime: { status: "healthy", lastCycleDuration: 0, errorCount: 0, successRate: 100 },
    }

    console.log("[v0] TradeEngineManager initialized (timer-based async processor)")
  }

  /**
   * Start the trade engine
   */
  async start(config: EngineConfig): Promise<void> {
    if (this.isRunning) {
      console.log("[v0] Trade engine already running for connection:", this.connectionId)
      return
    }

    console.log("[v0] Starting trade engine for connection:", this.connectionId)

    try {
      // Update engine state
      await this.updateEngineState("running")

      // Load prehistoric data first
      await this.loadPrehistoricData()

      // Start async processors
      this.startIndicationProcessor(config.indicationInterval)
      this.startStrategyProcessor(config.strategyInterval)
      this.startRealtimeProcessor(config.realtimeInterval)
      this.startHealthMonitoring()

      this.isRunning = true
      console.log("[v0] Trade engine started successfully")
    } catch (error) {
      console.error("[v0] Failed to start trade engine:", error)
      await this.updateEngineState("error", error instanceof Error ? error.message : "Unknown error")
      throw error
    }
  }

  /**
   * Stop the trade engine
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log("[v0] Trade engine not running")
      return
    }

    console.log("[v0] Stopping trade engine for connection:", this.connectionId)

    // Clear all timers
    if (this.indicationTimer) clearInterval(this.indicationTimer)
    if (this.strategyTimer) clearInterval(this.strategyTimer)
    if (this.realtimeTimer) clearInterval(this.realtimeTimer)
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer)

    this.isRunning = false

    // Update engine state
    await this.updateEngineState("stopped")

    console.log("[v0] Trade engine stopped")
  }

  /**
   * Load prehistoric data (historical data before real-time processing)
   */
  private async loadPrehistoricData(): Promise<void> {
    console.log("[v0] Loading prehistoric data...")

    try {
      // Check if prehistoric data already loaded from Redis
      const engineState = await getSettings(`trade_engine_state:${this.connectionId}`)
      
      if (engineState?.prehistoric_data_loaded) {
        console.log("[v0] Prehistoric data already loaded, skipping...")
        return
      }

      // Get symbols for this connection
      const symbols = await this.getSymbols()

      // Define prehistoric data range (e.g., last 30 days)
      const prehistoricEnd = new Date()
      const prehistoricStart = new Date(prehistoricEnd.getTime() - 30 * 24 * 60 * 60 * 1000)

      // Process each symbol
      for (const symbol of symbols) {
        // Check what data already exists in Redis
        const syncStatus = await DataSyncManager.checkSyncStatus(
          this.connectionId,
          symbol,
          "market_data",
          prehistoricStart,
          prehistoricEnd,
        )

        if (syncStatus.needsSync) {
          // Load missing data ranges
          for (const range of syncStatus.missingRanges) {
            await this.loadMarketDataRange(symbol, range.start, range.end)
          }
        }

        // Calculate indications for prehistoric data
        await this.indicationProcessor.processHistoricalIndications(symbol, prehistoricStart, prehistoricEnd)

        // Calculate strategies for prehistoric data
        await this.strategyProcessor.processHistoricalStrategies(symbol, prehistoricStart, prehistoricEnd)
      }

      // Mark prehistoric data as loaded in Redis
      await setSettings(`trade_engine_state:${this.connectionId}`, {
        ...engineState,
        prehistoric_data_loaded: true,
        prehistoric_data_start: prehistoricStart.toISOString(),
        prehistoric_data_end: prehistoricEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })

      console.log("[v0] Prehistoric data loaded successfully")
    } catch (error) {
      console.error("[v0] Failed to load prehistoric data:", error)
      throw error
    }
  }

  /**
   * Load market data for a specific range
   */
  private async loadMarketDataRange(symbol: string, start: Date, end: Date): Promise<void> {
    try {
      console.log(`[v0] Loading market data for ${symbol} from ${start.toISOString()} to ${end.toISOString()}`)

      // Get market data from Redis cache if available
      const marketDataKey = `market_data:${this.connectionId}:${symbol}`
      const cachedData = await getSettings(marketDataKey)
      
      if (cachedData && Array.isArray(cachedData)) {
        console.log(`[v0] Found ${cachedData.length} cached market data points for ${symbol}`)
        return
      }

      console.log(`[v0] No cached market data for ${symbol}, will use real-time data`)
    } catch (error) {
      console.error(`[v0] Error loading market data for ${symbol}:`, error)
    }
  }

  /**
   * Start indication processor (async)
   */
  private startIndicationProcessor(intervalSeconds: number): void {
    console.log(`[v0] Starting indication processor (interval: ${intervalSeconds}s)`)

    let cycleCount = 0
    let totalDuration = 0
    let errorCount = 0

    this.indicationTimer = setInterval(async () => {
      const startTime = Date.now()

      try {
        const symbols = await this.getSymbols()

        // Process indications for all symbols asynchronously
        await Promise.all(symbols.map((symbol) => this.indicationProcessor.processIndication(symbol)))

        const duration = Date.now() - startTime
        cycleCount++
        totalDuration += duration

        this.componentHealth.indications.lastCycleDuration = duration
        this.componentHealth.indications.successRate = ((cycleCount - errorCount) / cycleCount) * 100

        // Update engine state in Redis
        const engineState = (await getSettings(`engine_state:${this.connectionId}`)) || {}
        await setSettings(`engine_state:${this.connectionId}`, {
          ...engineState,
          last_indication_run: new Date().toISOString(),
          indication_cycle_count: cycleCount,
          indication_avg_duration_ms: totalDuration / cycleCount,
        })
      } catch (error) {
        errorCount++
        this.componentHealth.indications.errorCount++
        console.error("[v0] Indication processor error:", error)
      }
    }, intervalSeconds * 1000)
  }

  /**
   * Start strategy processor (async)
   */
  private startStrategyProcessor(intervalSeconds: number): void {
    console.log(`[v0] Starting strategy processor (interval: ${intervalSeconds}s)`)

    let cycleCount = 0
    let totalDuration = 0
    let errorCount = 0

    this.strategyTimer = setInterval(async () => {
      const startTime = Date.now()

      try {
        const symbols = await this.getSymbols()

        // Process strategies for all symbols asynchronously
        await Promise.all(symbols.map((symbol) => this.strategyProcessor.processStrategy(symbol)))

        const duration = Date.now() - startTime
        cycleCount++
        totalDuration += duration

        this.componentHealth.strategies.lastCycleDuration = duration
        this.componentHealth.strategies.successRate = ((cycleCount - errorCount) / cycleCount) * 100

        // Update engine state in Redis
        const engineState = (await getSettings(`engine_state:${this.connectionId}`)) || {}
        await setSettings(`engine_state:${this.connectionId}`, {
          ...engineState,
          last_strategy_run: new Date().toISOString(),
          strategy_cycle_count: cycleCount,
          strategy_avg_duration_ms: totalDuration / cycleCount,
        })
      } catch (error) {
        errorCount++
        this.componentHealth.strategies.errorCount++
        console.error("[v0] Strategy processor error:", error)
      }
    }, intervalSeconds * 1000)
  }

  /**
   * Start realtime processor (async)
   */
  private startRealtimeProcessor(intervalSeconds: number): void {
    console.log(`[v0] Starting realtime processor (interval: ${intervalSeconds}s)`)

    let cycleCount = 0
    let totalDuration = 0
    let errorCount = 0

    this.realtimeTimer = setInterval(async () => {
      const startTime = Date.now()

      try {
        // Process realtime updates for active positions
        await this.realtimeProcessor.processRealtimeUpdates()

        const duration = Date.now() - startTime
        cycleCount++
        totalDuration += duration

        this.componentHealth.realtime.lastCycleDuration = duration
        this.componentHealth.realtime.successRate = ((cycleCount - errorCount) / cycleCount) * 100

        // Update engine state in Redis
        const engineState = (await getSettings(`engine_state:${this.connectionId}`)) || {}
        await setSettings(`engine_state:${this.connectionId}`, {
          ...engineState,
          last_realtime_run: new Date().toISOString(),
          realtime_cycle_count: cycleCount,
          realtime_avg_duration_ms: totalDuration / cycleCount,
        })
      } catch (error) {
        errorCount++
        this.componentHealth.realtime.errorCount++
        console.error("[v0] Realtime processor error:", error)
      }
    }, intervalSeconds * 1000)
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    const healthCheckInterval = 10000 // Check every 10 seconds

    console.log("[v0] Starting TradeEngineManager health monitoring (interval: 10s)")

    this.healthCheckTimer = setInterval(async () => {
      if (!this.isRunning) return

      try {
        // Update component health statuses
        this.componentHealth.indications.status = this.getComponentHealthStatus(
          this.componentHealth.indications.successRate,
          this.componentHealth.indications.lastCycleDuration,
          5000, // 5 second threshold
        )

        this.componentHealth.strategies.status = this.getComponentHealthStatus(
          this.componentHealth.strategies.successRate,
          this.componentHealth.strategies.lastCycleDuration,
          5000,
        )

        this.componentHealth.realtime.status = this.getComponentHealthStatus(
          this.componentHealth.realtime.successRate,
          this.componentHealth.realtime.lastCycleDuration,
          3000,
        )

        // Calculate overall health
        const overallHealth = this.calculateOverallHealth()

        // Update health status in Redis
        const engineState = (await getSettings(`engine_state:${this.connectionId}`)) || {}
        await setSettings(`engine_state:${this.connectionId}`, {
          ...engineState,
          manager_health_status: overallHealth,
          indications_health: this.componentHealth.indications.status,
          strategies_health: this.componentHealth.strategies.status,
          realtime_health: this.componentHealth.realtime.status,
          last_manager_health_check: new Date().toISOString(),
        })

        if (overallHealth !== "healthy") {
          console.warn(`[v0] TradeEngineManager health for ${this.connectionId}: ${overallHealth}`)
        }
      } catch (error) {
        console.error("[v0] TradeEngineManager health monitoring error:", error)
      }
    }, healthCheckInterval)
  }

  /**
   * Get component health status
   */
  private getComponentHealthStatus(
    successRate: number,
    lastCycleDuration: number,
    threshold: number,
  ): "healthy" | "degraded" | "unhealthy" {
    if (successRate < 80 || lastCycleDuration > threshold * 3) {
      return "unhealthy"
    }
    if (successRate < 95 || lastCycleDuration > threshold * 2) {
      return "degraded"
    }
    return "healthy"
  }

  /**
   * Calculate overall health
   */
  private calculateOverallHealth(): "healthy" | "degraded" | "unhealthy" {
    const components = [
      this.componentHealth.indications.status,
      this.componentHealth.strategies.status,
      this.componentHealth.realtime.status,
    ]

    const unhealthyCount = components.filter((s) => s === "unhealthy").length
    const degradedCount = components.filter((s) => s === "degraded").length

    if (unhealthyCount > 0) return "unhealthy"
    if (degradedCount > 0) return "degraded"
    return "healthy"
  }

  /**
   * Get symbols for this connection
   */
  private async getSymbols(): Promise<string[]> {
    try {
      // Get system settings from Redis
      const useMainSymbols = await getSettings("useMainSymbols")

      if (useMainSymbols === true || useMainSymbols === "true") {
        // Get main symbols from settings
        const mainSymbols = await getSettings("mainSymbols")
        if (Array.isArray(mainSymbols) && mainSymbols.length > 0) {
          return mainSymbols
        }
        if (typeof mainSymbols === "string") {
          try { return JSON.parse(mainSymbols) } catch { /* fall through */ }
        }
      }

      // Get symbol count from settings
      const symbolCountSetting = await getSettings("symbolsCount")
      const symbolCount = Number.parseInt(String(symbolCountSetting || "30"))

      const fallbackSymbols = [
        "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT",
        "DOGEUSDT", "LINKUSDT", "LITUSDT", "THETAUSDT", "AVAXUSDT",
        "MATICUSDT", "SOLUSDT", "UNIUSDT", "APTUSDT", "ARBUSDT",
      ]

      return fallbackSymbols.slice(0, symbolCount)
    } catch (error) {
      console.error("[v0] Failed to get symbols:", error)
      return ["BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"]
    }
  }

  /**
   * Update engine state (Redis-based)
   */
  private async updateEngineState(status: string, errorMessage?: string): Promise<void> {
    try {
      const stateKey = `engine_state:${this.connectionId}`
      const currentState = (await getSettings(stateKey)) || {}
      await setSettings(stateKey, {
        ...currentState,
        status,
        error_message: errorMessage || null,
        updated_at: new Date().toISOString(),
      })
    } catch (error) {
      console.error("[v0] Failed to update engine state:", error)
    }
  }

  /**
   * Get engine status (Redis-based)
   */
  async getStatus() {
    try {
      const stateKey = `engine_state:${this.connectionId}`
      const state = (await getSettings(stateKey)) || {}
      return {
        ...state,
        health: {
          overall: this.calculateOverallHealth(),
          components: {
            indications: { ...this.componentHealth.indications },
            strategies: { ...this.componentHealth.strategies },
            realtime: { ...this.componentHealth.realtime },
          },
          lastCheck: new Date(),
        },
      }
    } catch (error) {
      console.error("[v0] Failed to get engine status:", error)
      return null
    }
  }
}
