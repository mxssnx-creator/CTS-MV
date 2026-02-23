import { NextResponse } from "next/server"
import { getRedisClient, initRedis, getActiveConnectionsForEngine } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { ProgressionStateManager } from "@/lib/progression-state-manager"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET() {
  console.log("[v0] [Status] === TRADE ENGINE STATUS ENDPOINT CALLED (NEW VERSION) ===")
  try {
    await initRedis()
    console.log("[v0] [Status] Redis initialized")

    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()
    console.log("[v0] [Status] Got client and coordinator")
    
    // Check global engine status from Redis hash (start endpoint writes with hset)
    const engineHash = await client.hgetall("trade_engine:global") || {}
    const isGloballyRunning = engineHash.status === "running"
    const isGloballyPaused = engineHash.status === "paused"
    
    console.log(`[v0] [Status] Redis Engine Hash:`, JSON.stringify(engineHash))
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

    // Build connection status for ACTIVE connections only
    const connectionStatuses = await Promise.all(
      connections.map(async (conn: any) => {
        try {
          // Get progression state
          const progressionState = await ProgressionStateManager.getProgressionState(conn.id)
          
          // Get positions and trades counts
          const positionsKey = `positions:${conn.id}`
          const tradesKey = `trades:${conn.id}`
          
          const positionsCount = await client.scard(positionsKey)
          const tradesCount = await client.scard(tradesKey)

          // Determine if this connection's engine is actively running
          const connectionRunning = isGloballyRunning && !isGloballyPaused

          return {
            id: conn.id,
            name: conn.name,
            exchange: conn.exchange,
            status: connectionRunning ? "running" : "stopped",
            enabled: conn.is_enabled_dashboard === true || conn.is_enabled_dashboard === "1",
            activelyUsing: conn.is_enabled_dashboard === true || conn.is_enabled_dashboard === "1",
            positions: positionsCount,
            trades: tradesCount,
            progression: {
              cycles_completed: progressionState.cycles_completed || 0,
              successful_cycles: progressionState.successful_cycles || 0,
              failed_cycles: progressionState.failed_cycles || 0,
            },
            state: progressionState,
          }
        } catch (error) {
          console.error(`[v0] [Status] Error processing connection ${conn.id}:`, error)
          return {
            id: conn.id,
            name: conn.name,
            exchange: conn.exchange,
            status: "error",
            enabled: false,
            activelyUsing: false,
            positions: 0,
            trades: 0,
            progression: { cycles_completed: 0, successful_cycles: 0, failed_cycles: 0 },
            state: {},
            error: error instanceof Error ? error.message : "Unknown error",
          }
        }
      })
    )

    // Calculate summary
    const summary = {
      total: connectionStatuses.length,
      running: connectionStatuses.filter((c: any) => c.status === "running").length,
      stopped: connectionStatuses.filter((c: any) => c.status === "stopped" || c.status === "error").length,
      totalTrades: connectionStatuses.reduce((sum: number, c: any) => sum + (c.trades || 0), 0),
      totalPositions: connectionStatuses.reduce((sum: number, c: any) => sum + (c.positions || 0), 0),
      errors: connectionStatuses.filter((c: any) => c.error).length,
    }

    const responseBody = {
      success: true,
      running: isGloballyRunning,
      paused: isGloballyPaused,
      status: isGloballyRunning ? "running" : (isGloballyPaused ? "paused" : "stopped"),
      connections: connectionStatuses,
      summary,
    }

    console.log(`[v0] [Status] Returning ${connectionStatuses.length} active connections, global running: ${isGloballyRunning}`)
    return NextResponse.json(responseBody)
  } catch (error) {
    console.error("[v0] [Status] Error:", error)
    return NextResponse.json(
      {
        success: false,
        running: false,
        paused: false,
        status: "error",
        connections: [],
        summary: { total: 0, running: 0, stopped: 0, totalTrades: 0, totalPositions: 0, errors: 1 },
        error: error instanceof Error ? error.message : "Failed to fetch trade engine status",
      },
      { status: 500 }
    )
  }
}
