import { query } from "@/lib/db"

/**
 * Track indication statistics - called after each indication processing cycle
 * Records indication type, value, and confidence to database for statistics
 */
export async function trackIndicationStats(
  connectionId: string,
  symbol: string,
  indicationType: string,
  value: number,
  confidence: number
): Promise<void> {
  try {
    await query(
      `INSERT INTO indications (connection_id, symbol, type, value, confidence, calculated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [connectionId, symbol, indicationType, value, confidence]
    )
  } catch (e) {
    console.warn(`[v0] [Stats] Failed to track indication:`, e instanceof Error ? e.message : String(e))
  }
}

/**
 * Track strategy statistics - called after strategy evaluation
 * Records strategy type, counts, and metrics to database for statistics
 */
export async function trackStrategyStats(
  connectionId: string,
  symbol: string,
  strategyType: string,
  totalCreated: number,
  passedCount: number,
  profitFactor: number,
  drawdownTimeMinutes: number
): Promise<void> {
  try {
    await query(
      `INSERT INTO strategies_real (connection_id, symbol, type, count, passed_count, avg_profit_factor, avg_drawdown_time, evaluated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [connectionId, symbol, strategyType, totalCreated, passedCount, profitFactor, Math.round(drawdownTimeMinutes)]
    )
  } catch (e) {
    console.warn(`[v0] [Stats] Failed to track strategy:`, e instanceof Error ? e.message : String(e))
  }
}

/**
 * Get recent indication statistics for dashboard
 */
export async function getIndicationStats(connectionId: string, hoursBack: number = 24): Promise<any> {
  try {
    const stats = await query(
      `SELECT type, COUNT(*) as count, AVG(value) as avg_value, AVG(confidence) as avg_confidence
       FROM indications
       WHERE connection_id = ? AND calculated_at > datetime('now', ?)
       GROUP BY type`,
      [connectionId, `-${hoursBack} hours`]
    )
    return stats || []
  } catch (e) {
    console.warn(`[v0] [Stats] Failed to get indication stats:`, e instanceof Error ? e.message : String(e))
    return []
  }
}

/**
 * Get recent strategy statistics for dashboard
 */
export async function getStrategyStats(connectionId: string, hoursBack: number = 24): Promise<any> {
  try {
    const stats = await query(
      `SELECT type, COUNT(*) as count, SUM(passed_count) as total_passed, 
              AVG(avg_profit_factor) as avg_profit_factor, AVG(avg_drawdown_time) as avg_drawdown_time
       FROM strategies_real
       WHERE connection_id = ? AND evaluated_at > datetime('now', ?)
       GROUP BY type`,
      [connectionId, `-${hoursBack} hours`]
    )
    return stats || []
  } catch (e) {
    console.warn(`[v0] [Stats] Failed to get strategy stats:`, e instanceof Error ? e.message : String(e))
    return []
  }
}
