import { NextResponse, type NextRequest } from "next/server"
import { getAllConnections, initRedis, getRedisClient, getConnection } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const connectionId = searchParams.get("connectionId")

    console.log("[v0] [Trade Engine] Fetching trade engine status with progression info...")

    await initRedis()
    const client = getRedisClient()

    // If specific connection requested, return just that one
    if (connectionId) {
      const connection = await getConnection(connectionId)
      if (!connection) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 })
      }

      const stateKey = `trade_engine_state:${connectionId}`
      const state = await (client as any).hGetAll(stateKey)
      const tradesKey = `trades:${connectionId}`
      const positionsKey = `positions:${connectionId}`
      const trades = (await (client as any).sMembers(tradesKey)) || []
      const positions = (await (client as any).sMembers(positionsKey)) || []

      const isRunning = state?.is_running === "1" || state?.is_running === true
      const errorCount = parseInt(state?.error_count || "0")
      const cycleCount = parseInt(state?.cycle_count || "0")
      const successCount = parseInt(state?.success_count || "0")

      const engineStatus = {
        status: isRunning ? "running" : connection.is_enabled ? "starting" : "stopped",
        is_running: isRunning,
        connection_id: connectionId,
        connection_name: connection.name,
        exchange: connection.exchange,
        enabled: connection.is_enabled,
        active: connection.is_active,
        progression: {
          state: state?.state || "idle",
          cycles_completed: cycleCount,
          successful_cycles: successCount,
          cycle_success_rate: cycleCount > 0 ? ((successCount / cycleCount) * 100).toFixed(2) : "0",
          last_cycle_time: state?.last_cycle_time ? new Date(parseInt(state.last_cycle_time)).toISOString() : null,
        },
        trades: {
          total: trades.length,
          open_positions: positions.length,
        },
        performance: {
          error_count: errorCount,
          health_status: errorCount === 0 ? "healthy" : errorCount < 5 ? "degraded" : "unhealthy",
        },
      }

      return NextResponse.json({ engineStatus })
    }

    // Get all connections
    const connections = await getAllConnections()
    console.log("[v0] [Trade Engine] Found", connections.length, "total connections")

    // Get trade engine state for each connection
    const engineStates = []
    let totalRunning = 0
    let totalTrades = 0
    let totalPositions = 0
    let totalErrors = 0

    for (const connection of connections) {
      try {
        const stateKey = `trade_engine_state:${connection.id}`
        const state = await (client as any).hGetAll(stateKey)

        // Get trade metrics
        const tradesKey = `trades:${connection.id}`
        const positionsKey = `positions:${connection.id}`
        const trades = (await (client as any).sMembers(tradesKey)) || []
        const positions = (await (client as any).sMembers(positionsKey)) || []

        const isRunning = state?.is_running === "1" || state?.is_running === true
        const errorCount = parseInt(state?.error_count || "0")
        const cycleCount = parseInt(state?.cycle_count || "0")
        const successCount = parseInt(state?.success_count || "0")

        const engineState = {
          connection_id: connection.id,
          connection_name: connection.name,
          exchange: connection.exchange,
          enabled: connection.is_enabled,
          active: connection.is_active,
          is_running: isRunning,
          progression: {
            state: state?.state || "idle",
            cycles_completed: cycleCount,
            successful_cycles: successCount,
            cycle_success_rate: cycleCount > 0 ? ((successCount / cycleCount) * 100).toFixed(2) : "0",
            last_cycle_time: state?.last_cycle_time ? new Date(parseInt(state.last_cycle_time)).toISOString() : null,
            uptime_seconds: state?.uptime_seconds || "0",
          },
          trades: {
            total: trades.length,
            open_positions: positions.length,
            closed_trades: parseInt(state?.closed_trades || "0"),
            total_profit_loss: state?.total_pnl || "0",
          },
          performance: {
            error_count: errorCount,
            last_error: state?.last_error || null,
            last_error_time: state?.last_error_time ? new Date(parseInt(state.last_error_time)).toISOString() : null,
            health_status: errorCount === 0 ? "healthy" : errorCount < 5 ? "degraded" : "unhealthy",
          },
          timestamps: {
            started_at: state?.last_started_at ? new Date(parseInt(state.last_started_at)).toISOString() : null,
            stopped_at: state?.last_stopped_at ? new Date(parseInt(state.last_stopped_at)).toISOString() : null,
            last_updated: state?.last_updated ? new Date(parseInt(state.last_updated)).toISOString() : null,
          },
        }

        engineStates.push(engineState)

        if (isRunning) totalRunning++
        totalTrades += trades.length
        totalPositions += positions.length
        totalErrors += errorCount

        console.log(
          `[v0] [Trade Engine] Connection ${connection.name}: running=${isRunning}, trades=${trades.length}, positions=${positions.length}, errors=${errorCount}`
        )
      } catch (error) {
        console.warn(`[v0] [Trade Engine] Failed to get state for connection ${connection.id}:`, error)
        engineStates.push({
          connection_id: connection.id,
          connection_name: connection.name,
          exchange: connection.exchange,
          is_running: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    const response = {
      timestamp: new Date().toISOString(),
      summary: {
        total_connections: connections.length,
        running_engines: totalRunning,
        enabled_connections: connections.filter(c => c.is_enabled).length,
        total_trades: totalTrades,
        total_positions: totalPositions,
        total_errors: totalErrors,
      },
      engines: engineStates,
    }

    console.log("[v0] [Trade Engine] Status summary - running:", totalRunning, "trades:", totalTrades, "positions:", totalPositions, "errors:", totalErrors)
    
    await SystemLogger.logTradeEngine(`Trade engine status update - ${totalRunning}/${connections.length} running, ${totalTrades} trades, ${totalPositions} positions`, "info", {
      running: totalRunning,
      total: connections.length,
      trades: totalTrades,
      positions: totalPositions,
      errors: totalErrors,
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error("[v0] [Trade Engine] Failed to get status:", error)
    await SystemLogger.logError(error, "trade-engine", "GET /api/trade-engine/status")
    return NextResponse.json({
      error: "Failed to get trade engine status",
      message: error instanceof Error ? error.message : "Unknown error",
      engines: [],
    }, { status: 500 })
  }
}
