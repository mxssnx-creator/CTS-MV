import { NextResponse } from "next/server"
import { getRedisClient, initRedis, getActiveConnectionsForEngine } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { ProgressionStateManager } from "@/lib/progression-state-manager"
// Trade engine status endpoint - returns ONLY active connections (is_enabled_dashboard = true)

export async function GET() {
  try {
    await initRedis()

    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()
    
    // Get ONLY Active Connections (is_enabled_dashboard = true) - these are what the trade engine processes
    const connections = await getActiveConnectionsForEngine()

    let running = 0
    let totalTrades = 0
    let totalPositions = 0
    let totalErrors = 0

    const statuses = await Promise.all(
      connections.map(async (connection: any) => {
        try {
          const tradeEngineStateKey = `trade_engine_state:${connection.id}`
          const engineIsRunningKey = `engine_is_running:${connection.id}`

          const tradeEngineState = await (client as any).hgetall(tradeEngineStateKey)
          const isRunningValue = await (client as any).get(engineIsRunningKey)
          const manager = coordinator.getEngineManager(connection.id)

          const managerExists = manager !== undefined
          const redisRunning = isRunningValue === "true" || isRunningValue === "1"

          const lastIndication = tradeEngineState?.last_indication_run ? new Date(tradeEngineState.last_indication_run) : null
          const recentlyActive = lastIndication ? (Date.now() - lastIndication.getTime()) < 10000 : false

          const actuallyRunning = managerExists || redisRunning || recentlyActive

          if (actuallyRunning) running++

          const tradesKey = `trades:${connection.id}`
          const positionsKey = `positions:${connection.id}`
          const trades = (await (client as any).smembers(tradesKey)) || []
          const positions = (await (client as any).smembers(positionsKey)) || []

          const progression = await ProgressionStateManager.getProgressionState(connection.id)

          totalTrades += trades.length
          totalPositions += positions.length

          return {
            id: connection.id,
            name: connection.name,
            exchange: connection.exchange,
            enabled: connection.is_enabled === true || (connection.is_enabled as any) === "1" || (connection.is_enabled as any) === "true",
            activelyUsing: connection.is_enabled_dashboard === true || (connection.is_enabled_dashboard as any) === "1" || (connection.is_enabled_dashboard as any) === "true",
            status: actuallyRunning ? "running" : "stopped",
            trades: trades.length,
            positions: positions.length,
            state: tradeEngineState || {},
            progression: {
              cycles_completed: progression.cyclesCompleted,
              successful_cycles: progression.successfulCycles,
              failed_cycles: progression.failedCycles,
              last_error: progression.lastError,
            },
          }
        } catch (error) {
          totalErrors++
          return {
            id: connection.id,
            name: connection.name,
            exchange: connection.exchange,
            status: "error",
            error: String(error),
          }
        }
      })
    )

    const isGloballyRunning = coordinator.isRunning()
    const isGloballyPaused = coordinator.isPausedState()

    const responseBody = {
      success: true,
      running: isGloballyRunning,
      paused: isGloballyPaused,
      status: isGloballyRunning ? (isGloballyPaused ? "paused" : "running") : "stopped",
      connections: statuses,
      summary: {
        total: connections.length,
        running,
        stopped: connections.length - running,
        totalTrades,
        totalPositions,
        errors: totalErrors,
      },
    }

    return NextResponse.json(responseBody)
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to get trade engine status", details: String(error) },
      { status: 500 }
    )
  }
}
