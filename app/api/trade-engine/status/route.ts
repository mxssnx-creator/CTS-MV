import { NextResponse } from "next/server"
import { getRedisClient, initRedis, getAllConnections } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { ProgressionStateManager } from "@/lib/progression-state-manager"

export async function GET() {
  try {
    await initRedis()

    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()
    const connections = await getAllConnections()

    let running = 0
    let totalTrades = 0
    let totalPositions = 0
    let totalErrors = 0

    const statuses = await Promise.all(
      connections.map(async (connection: any) => {
        try {
          const stateKey = `trade_engine_state:${connection.id}`
          const state = await client.hgetall(stateKey)

          const tradesKey = `trades:${connection.id}`
          const positionsKey = `positions:${connection.id}`
          const trades = (await client.smembers(tradesKey)) || []
          const positions = (await client.smembers(positionsKey)) || []

          const progression = await ProgressionStateManager.getProgressionState(connection.id)

          const manager = coordinator.getEngineManager(connection.id)
          const isRunning = manager !== undefined

          if (isRunning) running++
          totalTrades += trades.length
          totalPositions += positions.length

          return {
            id: connection.id,
            name: connection.name,
            exchange: connection.exchange,
            enabled: connection.is_enabled === true || connection.is_enabled === "true" || connection.is_enabled === "1",
            activelyUsing: connection.is_enabled_dashboard === true || connection.is_enabled_dashboard === "true" || connection.is_enabled_dashboard === "1",
            status: isRunning ? "running" : "stopped",
            trades: trades.length,
            positions: positions.length,
            state: state || {},
            progression: {
              cycles_completed: progression.cyclesCompleted,
              successful_cycles: progression.successfulCycles,
              failed_cycles: progression.failedCycles,
              cycle_success_rate: progression.cycleSuccessRate.toFixed(1) + "%",
              total_trades: progression.totalTrades,
              successful_trades: progression.successfulTrades,
              trade_success_rate: progression.tradeSuccessRate.toFixed(1) + "%",
              total_profit: progression.totalProfit.toFixed(2),
              last_cycle_time: progression.lastCycleTime?.toISOString() || null,
            },
          }
        } catch (error) {
          totalErrors++
          return {
            id: connection.id,
            name: connection.name,
            exchange: connection.exchange,
            enabled: connection.is_enabled === true || connection.is_enabled === "true" || connection.is_enabled === "1",
            activelyUsing: connection.is_enabled_dashboard === true || connection.is_enabled_dashboard === "true" || connection.is_enabled_dashboard === "1",
            status: "error",
            trades: 0,
            positions: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          }
        }
      }),
    )

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_connections: connections.length,
        running,
        total_trades: totalTrades,
        total_positions: totalPositions,
        total_errors: totalErrors,
      },
      statuses,
    })
  } catch (error) {
    console.error("[v0] [Trade Engine] Error fetching status:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
