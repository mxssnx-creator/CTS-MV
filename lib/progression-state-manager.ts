/**
 * Progression State Manager
 * Tracks trade engine progression metrics (cycles completed, success rates, etc.)
 * State is persisted to Redis for durability across restarts
 */

import { getRedisClient } from "@/lib/redis-db"

export interface ProgressionState {
  connectionId: string
  cyclesCompleted: number
  successfulCycles: number
  failedCycles: number
  totalTrades: number
  successfulTrades: number
  totalProfit: number
  cycleSuccessRate: number // percentage
  tradeSuccessRate: number // percentage
  lastCycleTime: Date | null
  lastUpdate: Date
  prehistoricCyclesCompleted?: number
  prehistoricSymbolsProcessed?: string[]
  prehistoricPhaseActive?: boolean
}

export class ProgressionStateManager {
  /**
   * Get current progression state for a connection
   */
  static async getProgressionState(connectionId: string): Promise<ProgressionState> {
    try {
      const client = getRedisClient()
      const key = `progression:${connectionId}`
      const data = await client.hgetall(key)

      if (!data || Object.keys(data).length === 0) {
        // Return default progression state
        return {
          connectionId,
          cyclesCompleted: 0,
          successfulCycles: 0,
          failedCycles: 0,
          totalTrades: 0,
          successfulTrades: 0,
          totalProfit: 0,
          cycleSuccessRate: 0,
          tradeSuccessRate: 0,
          lastCycleTime: null,
          lastUpdate: new Date(),
          prehistoricCyclesCompleted: 0,
          prehistoricSymbolsProcessed: [],
          prehistoricPhaseActive: false,
        }
      }

      return {
        connectionId,
        cyclesCompleted: parseInt(data.cycles_completed || "0", 10),
        successfulCycles: parseInt(data.successful_cycles || "0", 10),
        failedCycles: parseInt(data.failed_cycles || "0", 10),
        totalTrades: parseInt(data.total_trades || "0", 10),
        successfulTrades: parseInt(data.successful_trades || "0", 10),
        totalProfit: parseFloat(data.total_profit || "0"),
        cycleSuccessRate: parseFloat(data.cycle_success_rate || "0"),
        tradeSuccessRate: parseFloat(data.trade_success_rate || "0"),
        lastCycleTime: data.last_cycle_time ? new Date(data.last_cycle_time) : null,
        lastUpdate: new Date(data.last_update || new Date()),
        prehistoricCyclesCompleted: parseInt(data.prehistoric_cycles_completed || "0", 10),
        prehistoricSymbolsProcessed: data.prehistoric_symbols_processed ? JSON.parse(data.prehistoric_symbols_processed) : [],
        prehistoricPhaseActive: data.prehistoric_phase_active === "true",
      }
    } catch (error) {
      console.error(`[v0] Failed to get progression state for ${connectionId}:`, error)
      // Return default on error
      return {
        connectionId,
        cyclesCompleted: 0,
        successfulCycles: 0,
        failedCycles: 0,
        totalTrades: 0,
        successfulTrades: 0,
        totalProfit: 0,
        cycleSuccessRate: 0,
        tradeSuccessRate: 0,
        lastCycleTime: null,
        lastUpdate: new Date(),
        prehistoricCyclesCompleted: 0,
        prehistoricSymbolsProcessed: [],
        prehistoricPhaseActive: false,
      }
    }
  }

  /**
   * Increment completed cycle (successful or failed)
   * OPTIMIZED: Only update every 10 cycles to reduce Redis writes
   */
  private static cycleCounters: Map<string, number> = new Map()
  
  static async incrementCycle(connectionId: string, successful: boolean, profit: number = 0): Promise<void> {
    try {
      // Track locally for batching
      const localCount = (this.cycleCounters.get(connectionId) || 0) + 1
      this.cycleCounters.set(connectionId, localCount)
      
      // Only write to Redis every 10 cycles for performance
      if (localCount % 10 !== 0) return
      
      const client = getRedisClient()
      if (!client) {
        console.warn("[v0] [Progression] No Redis client available")
        return
      }
      
      const key = `progression:${connectionId}`

      // Get current state
      const current = await this.getProgressionState(connectionId)

      // Update metrics (add 10 cycles worth)
      const cyclesCompleted = current.cyclesCompleted + 10
      const successfulCycles = successful ? current.successfulCycles + 10 : current.successfulCycles
      const failedCycles = !successful ? current.failedCycles + 10 : current.failedCycles
      const totalProfit = current.totalProfit + profit
      const cycleSuccessRate = cyclesCompleted > 0 ? (successfulCycles / cyclesCompleted) * 100 : 0

      // Save to Redis (all values must be strings for hset)
      await client.hset(key, {
        cycles_completed: String(cyclesCompleted),
        successful_cycles: String(successfulCycles),
        failed_cycles: String(failedCycles),
        total_profit: String(totalProfit.toFixed(4)),
        cycle_success_rate: String(cycleSuccessRate.toFixed(2)),
        last_cycle_time: new Date().toISOString(),
        last_update: new Date().toISOString(),
        connection_id: connectionId,
      })

      // Set expiration to 7 days (progression state is accumulated)
      await client.expire(key, 7 * 24 * 60 * 60)

      // Log every 100 cycles (10 batches)
      if (cyclesCompleted % 100 === 0) {
        console.log(`[v0] [Progression] ${connectionId}: ${cyclesCompleted} cycles (${cycleSuccessRate.toFixed(1)}% success)`)
      }
    } catch (error) {
      console.error(`[v0] [Progression] Failed to increment cycle for ${connectionId}:`, error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Track prehistoric phase progress (separate from realtime)
   */
  static async incrementPrehistoricCycle(connectionId: string, symbol: string): Promise<void> {
    try {
      const client = getRedisClient()
      const key = `progression:${connectionId}`

      // Get current state
      const current = await this.getProgressionState(connectionId)

      // Update prehistoric metrics
      const prehistoricCycles = (current.prehistoricCyclesCompleted || 0) + 1
      const symbolsProcessed = current.prehistoricSymbolsProcessed || []
      
      if (!symbolsProcessed.includes(symbol)) {
        symbolsProcessed.push(symbol)
      }

      // Save to Redis
      await client.hset(key, {
        prehistoric_cycles_completed: String(prehistoricCycles),
        prehistoric_symbols_processed: JSON.stringify(symbolsProcessed),
        prehistoric_phase_active: "true",
        last_update: new Date().toISOString(),
      })

      console.log(`[v0] [Prehistoric] Symbol ${symbol}: Cycle ${prehistoricCycles} | Processed: ${symbolsProcessed.join(", ")}`)
    } catch (error) {
      console.error(`[v0] Failed to track prehistoric cycle for ${connectionId}:`, error)
    }
  }

  /**
   * Mark prehistoric phase as complete
   */
  static async completePrehistoricPhase(connectionId: string): Promise<void> {
    try {
      const client = getRedisClient()
      const key = `progression:${connectionId}`

      await client.hset(key, {
        prehistoric_phase_active: "false",
        last_update: new Date().toISOString(),
      })

      console.log(`[v0] [Prehistoric] Phase completed for connection ${connectionId}`)
    } catch (error) {
      console.error(`[v0] Failed to mark prehistoric phase complete:`, error)
    }
  }

  /**
   * Record a trade execution
   */
  static async recordTrade(connectionId: string, successful: boolean, profit: number = 0): Promise<void> {
    try {
      const client = getRedisClient()
      const key = `progression:${connectionId}`

      // Get current state
      const current = await this.getProgressionState(connectionId)

      // Update trade metrics
      const totalTrades = current.totalTrades + 1
      const successfulTrades = successful ? current.successfulTrades + 1 : current.successfulTrades
      const totalProfit = current.totalProfit + profit
      const tradeSuccessRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0

      // Save to Redis
      await client.hset(key, {
        total_trades: String(totalTrades),
        successful_trades: String(successfulTrades),
        total_profit: String(totalProfit),
        trade_success_rate: String(tradeSuccessRate),
        last_update: new Date().toISOString(),
      })

      console.log(`[v0] [Progression] Trade recorded: ${successful ? "✓ Win" : "✗ Loss"} | Profit: ${profit.toFixed(2)} | Success Rate: ${tradeSuccessRate.toFixed(1)}%`)
    } catch (error) {
      console.error(`[v0] Failed to record trade for ${connectionId}:`, error)
    }
  }

  /**
   * Reset progression state (useful for testing or manual reset)
   */
  static async resetProgressionState(connectionId: string): Promise<void> {
    try {
      const client = getRedisClient()
      const key = `progression:${connectionId}`
      await client.del(key)
      console.log(`[v0] [Progression] State reset for ${connectionId}`)
    } catch (error) {
      console.error(`[v0] Failed to reset progression state for ${connectionId}:`, error)
    }
  }
}
