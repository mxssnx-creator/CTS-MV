/**
 * Progression State Manager
 * Tracks trade engine progression metrics (cycles completed, success rates, etc.)
 * State is persisted to Redis for durability across restarts
 */

import { getClient } from "@/lib/redis-db"

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
}

export class ProgressionStateManager {
  /**
   * Get current progression state for a connection
   */
  static async getProgressionState(connectionId: string): Promise<ProgressionState> {
    try {
      const client = getClient()
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
      }
    }
  }

  /**
   * Increment completed cycle (successful or failed)
   */
  static async incrementCycle(connectionId: string, successful: boolean, profit: number = 0): Promise<void> {
    try {
      const client = getClient()
      const key = `progression:${connectionId}`

      // Get current state
      const current = await this.getProgressionState(connectionId)

      // Update metrics
      const cyclesCompleted = current.cyclesCompleted + 1
      const successfulCycles = successful ? current.successfulCycles + 1 : current.successfulCycles
      const failedCycles = !successful ? current.failedCycles + 1 : current.failedCycles
      const totalProfit = current.totalProfit + profit
      const cycleSuccessRate = cyclesCompleted > 0 ? (successfulCycles / cyclesCompleted) * 100 : 0

      // Save to Redis
      await client.hset(key, {
        cycles_completed: String(cyclesCompleted),
        successful_cycles: String(successfulCycles),
        failed_cycles: String(failedCycles),
        total_profit: String(totalProfit),
        cycle_success_rate: String(cycleSuccessRate),
        last_cycle_time: new Date().toISOString(),
        last_update: new Date().toISOString(),
      })

      // Set expiration to 7 days (progression state is accumulated)
      await client.expire(key, 7 * 24 * 60 * 60)

      console.log(`[v0] [Progression] Cycle ${cyclesCompleted}: ${successful ? "✓ Success" : "✗ Failed"} (rate: ${cycleSuccessRate.toFixed(1)}%)`)
    } catch (error) {
      console.error(`[v0] Failed to increment cycle for ${connectionId}:`, error)
    }
  }

  /**
   * Record a trade execution
   */
  static async recordTrade(connectionId: string, successful: boolean, profit: number = 0): Promise<void> {
    try {
      const client = getClient()
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
      const client = getClient()
      const key = `progression:${connectionId}`
      await client.del(key)
      console.log(`[v0] [Progression] State reset for ${connectionId}`)
    } catch (error) {
      console.error(`[v0] Failed to reset progression state for ${connectionId}:`, error)
    }
  }
}
