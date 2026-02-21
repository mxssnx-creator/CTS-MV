import { NextResponse } from "next/server"
import { getRedisClient, initRedis, getActiveConnectionsForEngine } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { ProgressionStateManager } from "@/lib/progression-state-manager"
// Trade engine status endpoint - returns ONLY active connections (is_enabled_dashboard = true)
// Updated: 2026-02-20 v3 - Use getActiveConnectionsForEngine() for proper filtering

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET() {
  console.log("[v0] [Status] === TRADE ENGINE STATUS ENDPOINT CALLED ===")
  try {
    await initRedis()
    console.log("[v0] [Status] Redis initialized")

    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()
    console.log("[v0] [Status] Got client and coordinator")
    
    // Check global engine status FIRST - independent of active connections count
    const isGloballyRunning = coordinator.isRunning()
    const isGloballyPaused = coordinator.isPausedState()
    
    console.log(`[v0] [Status] Global Engine State - Running: ${isGloballyRunning}, Paused: ${isGloballyPaused}`)
    
    // Get ONLY Active Connections (is_enabled_dashboard = true) - independent from base connections
    console.log("[v0] [Status] Calling getActiveConnectionsForEngine()...")
    const connections = await getActiveConnectionsForEngine()
    
    console.log(`[v0] [Status] *** ACTIVE CONNECTIONS COUNT: ${connections.length} ***`)
    
    // If no active connections, return status based on global engine state
    if (connections.length === 0) {
      console.log("[v0] [Status] No active connections - returning status based on global engine state")
      return NextResponse.json({
        success: true,
        running: isGloballyRunning,
        paused: isGloballyPaused,
        status: isGloballyRunning ? "running" : (isGloballyPaused ? "paused" : "stopped"),
        connections: [],
        summary: { total: 0, running: 0, stopped: 0, totalTrades: 0, totalPositions: 0, errors: 0 },
        message: isGloballyRunning ? "Trade engine running but no active connections to process" : undefined
      })
    }

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
