import { NextResponse } from "next/server"
import { getRedisClient, initRedis, getAllConnections } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { ProgressionStateManager } from "@/lib/progression-state-manager"

export async function GET() {
  try {
    await initRedis()

    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()
    const allConnections = await getAllConnections()

    // ONLY return status for connections that are ACTIVE on dashboard
    const connections = allConnections.filter((c: any) => {
      const isActive = c.is_enabled_dashboard === true || c.is_enabled_dashboard === "true" || c.is_enabled_dashboard === "1"
      return isActive
    })

    console.log(`[v0] [Status] Filtering from ${allConnections.length} total to ${connections.length} active connections on dashboard`)

    let running = 0
    let totalTrades = 0
    let totalPositions = 0
    let totalErrors = 0

    const statuses = await Promise.all(
      connections.map(async (connection: any) => {
        try {
          // Check multiple state keys for running status
          const tradeEngineStateKey = `trade_engine_state:${connection.id}`
          const engineIsRunningKey = `engine_is_running:${connection.id}`

          const tradeEngineState = await (client as any).hgetall(tradeEngineStateKey)
          const isRunningValue = await (client as any).get(engineIsRunningKey)
          const manager = coordinator.getEngineManager(connection.id)

          // Engine is running if ANY of these indicators show true:
          // 1. Manager exists in coordinator (in-memory check)
          // 2. Redis flag says it's running
          // 3. State shows recent indication activity (within 10 seconds, since heartbeat runs every 2s)
          const managerExists = manager !== undefined
          const redisRunning = isRunningValue === "true" || isRunningValue === "1"
          
          const lastIndication = tradeEngineState?.last_indication_run ? new Date(tradeEngineState.last_indication_run) : null
          const recentlyActive = lastIndication ? (Date.now() - lastIndication.getTime()) < 10000 : false

          const actuallyRunning = managerExists || redisRunning || recentlyActive

          console.log(`[v0] [Status] ${connection.id}: managerExists=${managerExists}, redisRunning=${redisRunning}, recentlyActive=${recentlyActive} (lastIndication=${lastIndication?.toISOString()}), result=${actuallyRunning}`)

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
            enabled: connection.is_enabled === true || connection.is_enabled === "true" || connection.is_enabled === "1",
            activelyUsing: connection.is_enabled_dashboard === true || connection.is_enabled_dashboard === "true" || connection.is_enabled_dashboard === "1",
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
          console.error(`[v0] [Status] Error fetching status for connection ${connection.id}:`, error)
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

    return NextResponse.json({
      success: true,
      connections: statuses,
      summary: {
        total: connections.length,
        running,
        stopped: connections.length - running,
        totalTrades,
        totalPositions,
        errors: totalErrors,
      },
    })
  } catch (error) {
    console.error("[v0] [Status] Failed to get trade engine status:", error)
    return NextResponse.json(
      { success: false, error: "Failed to get trade engine status", details: String(error) },
      { status: 500 }
    )
  }
}
