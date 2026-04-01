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
   * BATCHED: Only writes to Redis every 10 cycles to reduce I/O and memory usage
   */
  private static cycleCounters: Map<string, { completed: number; successful: number; failed: number }> = new Map()

  static async incrementCycle(connectionId: string, successful: boolean, profit: number = 0): Promise<void> {
    try {
      // Update local counter
      let counter = this.cycleCounters.get(connectionId) || { completed: 0, successful: 0, failed: 0 }
      counter.completed++
      if (successful) {
        counter.successful++
      } else {
        counter.failed++
      }
      this.cycleCounters.set(connectionId, counter)

      // Only write to Redis every 10 cycles for performance
      if (counter.completed % 10 !== 0) return

      const client = getRedisClient()
      if (!client) return

      const redisKey = `progression:${connectionId}`
      const successRate = counter.completed > 0 ? (counter.successful / counter.completed) * 100 : 0

      // Write batched update to Redis
      await client.hset(redisKey, {
        cycles_completed: String(counter.completed),
        successful_cycles: String(counter.successful),
        failed_cycles: String(counter.failed),
        cycle_success_rate: String(successRate.toFixed(2)),
        last_update: new Date().toISOString(),
        connection_id: connectionId,
      })

      // Set expiration
      await client.expire(redisKey, 7 * 24 * 60 * 60)

      // Log every 100 cycles
      if (counter.completed % 100 === 0 && counter.completed > 0) {
        console.log(`[v0] [Progression] Cycle ${counter.completed}: ${successRate.toFixed(1)}% success rate`)
      }
    } catch (error) {
      // Silent fail to not block processing
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
