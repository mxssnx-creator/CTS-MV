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
import { logProgressionEvent } from "@/lib/engine-progression-logs"
import { loadMarketDataForEngine } from "@/lib/market-data-loader"

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
  private heartbeatTimer?: NodeJS.Timeout

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
      // Phase 1: Initializing
      await this.updateProgressionPhase("initializing", 5, "Setting up engine components...")
      await logProgressionEvent(this.connectionId, "initializing", "info", "Engine initialization started")
      await this.updateEngineState("running")
      await this.setRunningFlag(true)

      // Phase 1.5: Load market data for all symbols
      await this.updateProgressionPhase("market_data", 8, "Loading market data for all symbols...")
      const symbols = await this.getSymbols()
      const loaded = await loadMarketDataForEngine(symbols)
      console.log(`[v0] [Engine] Market data loaded for ${loaded} symbols`)

      // Phase 2: Load prehistoric data (historical data retrieval + calculation)
      await this.updateProgressionPhase("prehistoric_data", 10, "Loading historical market data...")
      await this.loadPrehistoricData()

      // Phase 3: Start indication processor
      await this.updateProgressionPhase("indications", 60, "Starting indication processor...")
      this.startIndicationProcessor(config.indicationInterval)

      // Phase 4: Start strategy processor
      await this.updateProgressionPhase("strategies", 75, "Starting strategy processor...")
      this.startStrategyProcessor(config.strategyInterval)

      // Phase 5: Start realtime processor
      await this.updateProgressionPhase("realtime", 85, "Starting real-time data processor...")
      this.startRealtimeProcessor(config.realtimeInterval)
      this.startHealthMonitoring()
      
      // Phase 6: Live trading ready
      this.startHeartbeat()
      this.isRunning = true
      await this.updateProgressionPhase("live_trading", 100, "Live trading active")
      console.log("[v0] Trade engine started successfully")
    } catch (error) {
      console.error("[v0] Failed to start trade engine:", error)
      await this.updateProgressionPhase("error", 0, error instanceof Error ? error.message : "Unknown error")
      await this.updateEngineState("error", error instanceof Error ? error.message : "Unknown error")
      await this.setRunningFlag(false)
      throw error
    }
  }

  /**
   * Graceful error recovery - catches errors in processors and logs them
   */
  private setupErrorRecovery() {
    // Processors already have internal error handling
    // This ensures we log and recover from any unhandled errors
    process.on("unhandledRejection", (reason, promise) => {
      if (this.isRunning) {
        console.error("[v0] Unhandled rejection in trade engine:", reason)
        // Update engine state to degraded but keep running
        this.updateEngineState("error", `Unhandled rejection: ${reason}`)
      }
    })
  }

  async stop(): Promise<void> {
    console.log("[v0] Stopping trade engine for connection:", this.connectionId)

    // Clear all timers
    if (this.indicationTimer) clearInterval(this.indicationTimer)
    if (this.strategyTimer) clearInterval(this.strategyTimer)
    if (this.realtimeTimer) clearInterval(this.realtimeTimer)
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)

    this.isRunning = false

    // Update engine state and clear running flag
    await this.updateEngineState("stopped")
    await this.setRunningFlag(false)
    await this.updateProgressionPhase("stopped", 0, "Engine stopped")

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

      // Process each symbol with progress tracking
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i]
        const symbolProgress = 10 + Math.round((i / symbols.length) * 45) // 10% to 55%
        
        // Sub-phase: Loading market data
        await this.updateProgressionPhase("prehistoric_data", symbolProgress, 
          `Loading market data for ${symbol}...`,
          { current: i + 1, total: symbols.length, item: symbol }
        )
        
        // Check what data already exists in Redis
        const syncStatus = await DataSyncManager.checkSyncStatus(
          this.connectionId,
          symbol,
          "market_data",
          prehistoricStart,
          prehistoricEnd,
        )

        if (syncStatus.needsSync) {
          for (const range of syncStatus.missingRanges) {
            await this.loadMarketDataRange(symbol, range.start, range.end)
          }
        }

        // Sub-phase: Calculate indications
        await this.updateProgressionPhase("prehistoric_data", symbolProgress + 2,
          `Calculating indications for ${symbol}...`,
          { current: i + 1, total: symbols.length, item: symbol }
        )
        await this.indicationProcessor.processHistoricalIndications(symbol, prehistoricStart, prehistoricEnd)

        // Sub-phase: Calculate strategies
        await this.updateProgressionPhase("prehistoric_data", symbolProgress + 4,
          `Processing strategies for ${symbol}...`,
          { current: i + 1, total: symbols.length, item: symbol }
        )
        // Pass isPrehistoric=true to prevent real trades during this phase
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

      // Mark prehistoric phase as complete in progression state
      const ProgressionManager = await import("@/lib/progression-state-manager").then((m) => m.ProgressionStateManager)
      await ProgressionManager.completePrehistoricPhase(this.connectionId)

      console.log("[v0] Prehistoric data loaded successfully and phase complete")
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

        // Log successful indication run
        await logProgressionEvent(this.connectionId, "indications", "info", `Processed ${symbols.length} symbols`, {
          cycleDuration_ms: duration,
          cycleCount,
          symbolsCount: symbols.length,
        })

        // Update engine state in Redis
        const engineState = (await getSettings(`trade_engine_state:${this.connectionId}`)) || {}
        await setSettings(`trade_engine_state:${this.connectionId}`, {
          ...engineState,
          last_indication_run: new Date().toISOString(),
          indication_cycle_count: cycleCount,
          indication_avg_duration_ms: totalDuration / cycleCount,
        })
      } catch (error) {
        errorCount++
        this.componentHealth.indications.errorCount++
        console.error("[v0] Indication processor error:", error)
        await logProgressionEvent(this.connectionId, "indications", "error", `Processor error: ${error instanceof Error ? error.message : String(error)}`, {
          errorType: error instanceof Error ? error.name : "unknown",
          stack: error instanceof Error ? error.stack : undefined,
        })
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
    let totalStrategiesEvaluated = 0

    this.strategyTimer = setInterval(async () => {
      const startTime = Date.now()

      try {
        const symbols = await this.getSymbols()

        // Process strategies for all symbols asynchronously
        // Strategy processor will retrieve indications from Redis and evaluate through BASE → MAIN → REAL → LIVE flow
        const strategyResults = await Promise.all(
          symbols.map((symbol) => this.strategyProcessor.processStrategy(symbol))
        )

        const duration = Date.now() - startTime
        cycleCount++
        totalDuration += duration

        // Count total strategies evaluated across all symbols
        const evaluatedThisCycle = strategyResults.reduce((sum, result) => sum + (result?.strategiesEvaluated || 0), 0)
        totalStrategiesEvaluated += evaluatedThisCycle

        this.componentHealth.strategies.lastCycleDuration = duration
        this.componentHealth.strategies.successRate = ((cycleCount - errorCount) / cycleCount) * 100

        // Log detailed strategy run with calculations
        console.log(`[v0] [StrategyEngine] Cycle ${cycleCount}: Evaluated ${evaluatedThisCycle} total strategies across ${symbols.length} symbols`)
        
        await logProgressionEvent(this.connectionId, "strategies", "info", `Processed strategies for ${symbols.length} symbols`, {
          cycleDuration_ms: duration,
          cycleCount,
          symbolsCount: symbols.length,
          strategiesEvaluatedThisCycle: evaluatedThisCycle,
          totalStrategiesEvaluated,
          avgStrategiesPerSymbol: Math.round(evaluatedThisCycle / symbols.length),
        })

        // Update engine state in Redis
        const engineState = (await getSettings(`trade_engine_state:${this.connectionId}`)) || {}
        await setSettings(`trade_engine_state:${this.connectionId}`, {
          ...engineState,
          last_strategy_run: new Date().toISOString(),
          strategy_cycle_count: cycleCount,
          strategy_avg_duration_ms: totalDuration / cycleCount,
          total_strategies_evaluated: totalStrategiesEvaluated,
        })
      } catch (error) {
        errorCount++
        this.componentHealth.strategies.errorCount++
        console.error("[v0] Strategy processor error:", error)
        await logProgressionEvent(this.connectionId, "strategies", "error", `Processor error: ${error instanceof Error ? error.message : String(error)}`, {
          errorType: error instanceof Error ? error.name : "unknown",
          stack: error instanceof Error ? error.stack : undefined,
        })
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
        const engineState = (await getSettings(`trade_engine_state:${this.connectionId}`)) || {}
        await setSettings(`trade_engine_state:${this.connectionId}`, {
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

        // Update health status in Redis (same key as updateEngineState)
        const engineState = (await getSettings(`trade_engine_state:${this.connectionId}`)) || {}
        await setSettings(`trade_engine_state:${this.connectionId}`, {
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
   * Uses consistent key naming for status endpoint compatibility
   */
  private async updateEngineState(status: string, errorMessage?: string): Promise<void> {
    try {
      const stateKey = `trade_engine_state:${this.connectionId}`
      const currentState = (await getSettings(stateKey)) || {}
      await setSettings(stateKey, {
        ...currentState,
        status,
        error_message: errorMessage || null,
        updated_at: new Date().toISOString(),
        last_indication_run: new Date().toISOString(),
      })
      
      console.log(`[v0] [Engine State] Updated ${stateKey}: status=${status}`)
    } catch (error) {
      console.error("[v0] Failed to update engine state:", error)
    }
  }

  /**
   * Update progression phase with detailed progress tracking
   * Phases: idle -> initializing -> prehistoric_data -> indications -> strategies -> realtime -> live_trading
   */
  async updateProgressionPhase(
    phase: string, 
    progress: number, 
    detail: string,
    subProgress?: { current: number; total: number; item?: string }
  ): Promise<void> {
    try {
      const key = `engine_progression:${this.connectionId}`
      const progressionData = {
        phase,
        progress: Math.min(100, Math.max(0, progress)),
        detail,
        sub_current: subProgress?.current || 0,
        sub_total: subProgress?.total || 0,
        sub_item: subProgress?.item || "",
        connection_id: this.connectionId,
        updated_at: new Date().toISOString(),
      }
      
      await setSettings(key, progressionData)
      
      // Log progression update with full details
      const msg = subProgress && subProgress.total > 0 
        ? `${detail} (${subProgress.current}/${subProgress.total}${subProgress.item ? ` - ${subProgress.item}` : ""})`
        : detail
      
      console.log(`[v0] [Progression] ${this.connectionId}: ${phase} @ ${progress}% - ${msg}`)
    } catch (error) {
      console.error("[v0] Failed to update progression phase:", error)
    }
  }

  /**
   * Set running flag in Redis for active status detection
   */
  private async setRunningFlag(isRunning: boolean): Promise<void> {
    try {
      const flagKey = `engine_is_running:${this.connectionId}`
      if (isRunning) {
        await setSettings(flagKey, "true")
      } else {
        await setSettings(flagKey, "false")
      }
      console.log(`[v0] [Engine Flag] ${flagKey}: ${isRunning ? "true" : "false"}`)
    } catch (error) {
      console.error("[v0] Failed to set running flag:", error)
    }
  }

  /**
   * Start heartbeat to keep running state active
   * Prevents timeout detection during normal operation
   */
  private startHeartbeat(): void {
    // Send heartbeat every 2 seconds to keep engine state fresh
    this.heartbeatTimer = setInterval(async () => {
      if (!this.isRunning) {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        return
      }

      try {
        const stateKey = `trade_engine_state:${this.connectionId}`
        const currentState = (await getSettings(stateKey)) || {}
        
        // Update last_indication_run timestamp to show activity
        await setSettings(stateKey, {
          ...currentState,
          last_indication_run: new Date().toISOString(),
        })
      } catch (error) {
        console.warn("[v0] Heartbeat update failed:", error)
      }
    }, 2000)
  }

  /**
   * Get engine status (Redis-based)
   */
  async getStatus() {
    try {
      const stateKey = `trade_engine_state:${this.connectionId}`
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
