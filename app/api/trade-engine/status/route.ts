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
          const engineStateKey = `trade_engine_state:${connection.id}`
          const engineManagerKey = `engine_manager:${connection.id}`
          const isRunningKey = `engine_is_running:${connection.id}`

          const engineState = await (client as any).hgetall(engineStateKey)
          const isRunning = await (client as any).get(isRunningKey)
          const manager = coordinator.getEngineManager(connection.id)

          // Engine is running if:
          // 1. Manager exists in coordinator AND manager.isRunning is true
          // 2. OR Redis key says it's running
          // 3. OR state shows last_indication_run recently
          const managerExists = manager !== undefined
          const redisRunning = isRunning === "true" || isRunning === "1"
          const lastIndication = engineState?.last_indication_run ? new Date(engineState.last_indication_run) : null
          const recentlyActive = lastIndication ? (Date.now() - lastIndication.getTime()) < 60000 : false // Last minute

          const actuallyRunning = managerExists || redisRunning || recentlyActive

          console.log(`[v0] [Status] Connection ${connection.id}: managerExists=${managerExists}, redisRunning=${redisRunning}, recentlyActive=${recentlyActive}, actuallyRunning=${actuallyRunning}`)

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
            state: engineState || {},
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

    // Calculate global engine state from Redis
    const globalState = await client.hgetall("trade_engine:global")
    const globalStatus = globalState?.status || "stopped"
    const isGloballyRunning = globalStatus === "running" && running > 0
    const isPaused = globalStatus === "paused"
    
    console.log(`[v0] [Status] Global state: ${globalStatus}, Running engines: ${running}, Globally running: ${isGloballyRunning}`)
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      running: isGloballyRunning,
      paused: isPaused,
      connectedExchanges: running, // Only count ACTIVE connections that are running
      activePositions: totalPositions,
      totalProfit: 0, // TODO: Calculate from positions
      uptime: 0, // TODO: Track uptime
      lastUpdate: new Date(),
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
