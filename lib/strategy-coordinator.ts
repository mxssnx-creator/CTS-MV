/**
 * Strategy Coordinator - Progressive Strategy Flow
 * Coordinates the progression from BASE → MAIN → REAL → LIVE with proper evaluation metrics
 * 
 * Flow:
 * 1. BASE: Create all pseudo positions (all qualifying indications)
 * 2. BASE FILTER: Evaluate by drawdownTime (maximal) and profitFactor (minimal) 
 * 3. MAIN: Create specific sets for previous position states + continuous positions
 * 4. REAL: Evaluate with exchange-specific drawdownTime/profitFactor thresholds
 * 5. LIVE: Final executable strategies for real exchange trading
 */

import { initRedis, getSettings, setSettings } from "@/lib/redis-db"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

export interface EvaluationMetrics {
  maxDrawdownTime: number // in minutes
  minProfitFactor: number
  confidence: number
  description: string
}

export interface StrategyEvaluation {
  type: "base" | "main" | "real" | "live"
  symbol: string
  timestamp: Date
  totalCreated: number
  passedEvaluation: number
  failedEvaluation: number
  avgProfitFactor: number
  avgDrawdownTime: number
}

export class StrategyCoordinator {
  private connectionId: string
  private readonly METRICS: Record<string, EvaluationMetrics> = {
    base: {
      maxDrawdownTime: 999999, // No limit - create all
      minProfitFactor: 1.0, // Minimum threshold only
      confidence: 0.3,
      description: "All qualifying pseudo positions"
    },
    main: {
      maxDrawdownTime: 1440, // 24 hours
      minProfitFactor: 1.2,
      confidence: 0.5,
      description: "Position-state specific strategies"
    },
    real: {
      maxDrawdownTime: 240, // 4 hours
      minProfitFactor: 1.5,
      confidence: 0.65,
      description: "Exchange-mirrored high-confidence strategies"
    },
    live: {
      maxDrawdownTime: 60, // 1 hour
      minProfitFactor: 2.0,
      confidence: 0.75,
      description: "Production-ready strategies for real trading"
    }
  }

  constructor(connectionId: string) {
    this.connectionId = connectionId
  }

  /**
   * Execute complete strategy progression flow
   */
  async executeStrategyFlow(symbol: string, indications: any[], isPrehistoric: boolean = false): Promise<StrategyEvaluation[]> {
    const results: StrategyEvaluation[] = []

    try {
      // STAGE 1: BASE - Create all pseudo positions
      console.log(`[v0] [StrategyFlow] ${symbol} STAGE 1: Creating BASE pseudo positions`)
      const baseResult = await this.createBaseStrategies(symbol, indications)
      results.push(baseResult)

      // STAGE 2: BASE EVALUATION - Filter by maxDrawdownTime and minProfitFactor
      console.log(`[v0] [StrategyFlow] ${symbol} STAGE 2: Evaluating BASE strategies`)
      const baseFiltered = await this.evaluateBaseStrategies(symbol)
      
      // STAGE 3: MAIN - Create position-state specific strategies from BASE survivors
      console.log(`[v0] [StrategyFlow] ${symbol} STAGE 3: Creating MAIN position-state strategies`)
      const mainResult = await this.createMainStrategies(symbol, baseFiltered)
      results.push(mainResult)

      // STAGE 4: REAL - Evaluate with exchange-specific thresholds
      console.log(`[v0] [StrategyFlow] ${symbol} STAGE 4: Evaluating REAL exchange strategies`)
      const realResult = await this.evaluateRealStrategies(symbol)
      results.push(realResult)

      // STAGE 5: LIVE - Final filter for real trading
      if (!isPrehistoric) {
        console.log(`[v0] [StrategyFlow] ${symbol} STAGE 5: Creating LIVE executable strategies`)
        const liveResult = await this.createLiveStrategies(symbol, realResult.passedEvaluation)
        results.push(liveResult)
      }

      // Log progression
      await this.logStrategyProgression(symbol, results)

      return results
    } catch (error) {
      console.error(`[v0] [StrategyCoordinator] Flow failed for ${symbol}:`, error)
      throw error
    }
  }

  /**
   * STAGE 1: Create BASE strategies - All qualifying pseudo positions
   */
  private async createBaseStrategies(symbol: string, indications: any[]): Promise<StrategyEvaluation> {
    const metrics = this.METRICS.base
    let totalCreated = 0
    const baseStrategies: any[] = []

    for (const indication of indications) {
      // BASE: Accept all indications meeting minimum profitFactor
      if (indication.profitFactor >= metrics.minProfitFactor) {
        baseStrategies.push({
          id: `${symbol}-base-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: "base",
          symbol,
          profitFactor: indication.profitFactor,
          confidence: indication.confidence,
          drawdownTime: indication.drawdownTime || 0,
          indicationType: indication.type,
          positionState: indication.positionState || "new",
          continuousPosition: indication.continuousPosition || false,
          created: new Date(),
          metadata: { ...indication.metadata }
        })
        totalCreated++
      }
    }

    // Store BASE strategies
    const setKey = `strategies:${this.connectionId}:${symbol}:base`
    await setSettings(setKey, { strategies: baseStrategies, count: totalCreated, created: new Date() })

    console.log(`[v0] [StrategyFlow] ${symbol} BASE: Created ${totalCreated} pseudo positions`)

    return {
      type: "base",
      symbol,
      timestamp: new Date(),
      totalCreated,
      passedEvaluation: totalCreated,
      failedEvaluation: 0,
      avgProfitFactor: baseStrategies.reduce((sum, s) => sum + s.profitFactor, 0) / (baseStrategies.length || 1),
      avgDrawdownTime: baseStrategies.reduce((sum, s) => sum + (s.drawdownTime || 0), 0) / (baseStrategies.length || 1)
    }
  }

  /**
   * STAGE 2: Evaluate BASE strategies - Filter by maxDrawdownTime and minProfitFactor
   */
  private async evaluateBaseStrategies(symbol: string): Promise<any[]> {
    const metrics = this.METRICS.base
    const setKey = `strategies:${this.connectionId}:${symbol}:base`
    
    const stored = await getSettings(setKey)
    const strategies = stored?.strategies || []

    const filtered = strategies.filter((s: any) => 
      s.drawdownTime <= metrics.maxDrawdownTime && 
      s.profitFactor >= metrics.minProfitFactor
    )

    console.log(`[v0] [StrategyFlow] ${symbol} BASE EVALUATION: ${filtered.length}/${strategies.length} passed (maxDDT=${metrics.maxDrawdownTime}min, minPF=${metrics.minProfitFactor})`)

    return filtered
  }

  /**
   * STAGE 3: Create MAIN strategies - Position-state specific from BASE survivors
   */
  private async createMainStrategies(symbol: string, baseSurvivors: any[]): Promise<StrategyEvaluation> {
    const metrics = this.METRICS.main
    let totalCreated = 0
    const mainStrategies: any[] = []

    // MAIN: Filter BASE survivors by position state and create state-specific sets
    const byPositionState = new Map<string, any[]>()
    
    for (const strategy of baseSurvivors) {
      const posState = strategy.positionState || "new"
      if (!byPositionState.has(posState)) {
        byPositionState.set(posState, [])
      }
      byPositionState.get(posState)!.push(strategy)
    }

    // Create MAIN strategies for each position state + continuous positions
    for (const [posState, strategies] of byPositionState) {
      const highConfidence = strategies.filter(s => s.confidence >= metrics.confidence)
      
      for (const strategy of highConfidence) {
        if (strategy.profitFactor >= metrics.minProfitFactor && strategy.drawdownTime <= metrics.maxDrawdownTime) {
          mainStrategies.push({
            ...strategy,
            id: `${symbol}-main-${posState}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: "main",
            positionState: posState,
            stateSpecific: true,
            created: new Date()
          })
          totalCreated++
        }
      }
    }

    // Store MAIN strategies
    const setKey = `strategies:${this.connectionId}:${symbol}:main`
    await setSettings(setKey, { strategies: mainStrategies, count: totalCreated, created: new Date() })

    console.log(`[v0] [StrategyFlow] ${symbol} MAIN: Created ${totalCreated} position-state specific strategies`)

    return {
      type: "main",
      symbol,
      timestamp: new Date(),
      totalCreated,
      passedEvaluation: totalCreated,
      failedEvaluation: baseSurvivors.length - totalCreated,
      avgProfitFactor: mainStrategies.reduce((sum, s) => sum + s.profitFactor, 0) / (mainStrategies.length || 1),
      avgDrawdownTime: mainStrategies.reduce((sum, s) => sum + (s.drawdownTime || 0), 0) / (mainStrategies.length || 1)
    }
  }

  /**
   * STAGE 4: Evaluate REAL strategies - Exchange-specific thresholds
   */
  private async evaluateRealStrategies(symbol: string): Promise<StrategyEvaluation> {
    const metrics = this.METRICS.real
    const setKey = `strategies:${this.connectionId}:${symbol}:main`
    
    const stored = await getSettings(setKey)
    const mainStrategies = stored?.strategies || []

    // Filter MAIN strategies with REAL metrics (mirror live exchange requirements)
    const realStrategies = mainStrategies.filter((s: any) =>
      s.profitFactor >= metrics.minProfitFactor &&
      s.drawdownTime <= metrics.maxDrawdownTime &&
      s.confidence >= metrics.confidence
    )

    // Store REAL strategies
    const realSetKey = `strategies:${this.connectionId}:${symbol}:real`
    await setSettings(realSetKey, { strategies: realStrategies, count: realStrategies.length, created: new Date() })

    console.log(`[v0] [StrategyFlow] ${symbol} REAL EVALUATION: ${realStrategies.length}/${mainStrategies.length} passed (maxDDT=${metrics.maxDrawdownTime}min, minPF=${metrics.minProfitFactor}, confidence=${metrics.confidence})`)

    return {
      type: "real",
      symbol,
      timestamp: new Date(),
      totalCreated: mainStrategies.length,
      passedEvaluation: realStrategies.length,
      failedEvaluation: mainStrategies.length - realStrategies.length,
      avgProfitFactor: realStrategies.reduce((sum: number, s: any) => sum + s.profitFactor, 0) / (realStrategies.length || 1),
      avgDrawdownTime: realStrategies.reduce((sum: number, s: any) => sum + (s.drawdownTime || 0), 0) / (realStrategies.length || 1)
    }
  }

  /**
   * STAGE 5: Create LIVE strategies - Final production-ready strategies
   */
  private async createLiveStrategies(symbol: string, realCount: number): Promise<StrategyEvaluation> {
    const metrics = this.METRICS.live
    const realSetKey = `strategies:${this.connectionId}:${symbol}:real`
    
    const stored = await getSettings(realSetKey)
    const realStrategies = stored?.strategies || []

    // Filter REAL strategies with LIVE metrics (most conservative for actual trading)
    const liveStrategies = realStrategies.filter((s: any) =>
      s.profitFactor >= metrics.minProfitFactor &&
      s.drawdownTime <= metrics.maxDrawdownTime &&
      s.confidence >= metrics.confidence
    )

    // Store LIVE strategies (executable)
    const liveSetKey = `strategies:${this.connectionId}:${symbol}:live`
    await setSettings(liveSetKey, { strategies: liveStrategies, count: liveStrategies.length, created: new Date(), executable: true })

    console.log(`[v0] [StrategyFlow] ${symbol} LIVE: ${liveStrategies.length}/${realStrategies.length} ready for trading (maxDDT=${metrics.maxDrawdownTime}min, minPF=${metrics.minProfitFactor}, confidence=${metrics.confidence})`)

    return {
      type: "live",
      symbol,
      timestamp: new Date(),
      totalCreated: realStrategies.length,
      passedEvaluation: liveStrategies.length,
      failedEvaluation: realStrategies.length - liveStrategies.length,
      avgProfitFactor: liveStrategies.reduce((sum: number, s: any) => sum + s.profitFactor, 0) / (liveStrategies.length || 1),
      avgDrawdownTime: liveStrategies.reduce((sum: number, s: any) => sum + (s.drawdownTime || 0), 0) / (liveStrategies.length || 1)
    }
  }

  /**
   * Log strategy progression through all stages
   */
  private async logStrategyProgression(symbol: string, results: StrategyEvaluation[]): Promise<void> {
    const summary = {
      symbol,
      stages: results.map(r => ({
        type: r.type,
        created: r.totalCreated,
        passed: r.passedEvaluation,
        failed: r.failedEvaluation,
        avgPF: r.avgProfitFactor.toFixed(2),
        avgDDT: r.avgDrawdownTime.toFixed(0)
      }))
    }

    console.log(`[v0] [StrategyFlow] ${symbol} COMPLETE: ${JSON.stringify(summary, null, 2)}`)

    await logProgressionEvent(this.connectionId, "strategy_flow", "info", `Complete strategy flow for ${symbol}`, summary)
  }
}
