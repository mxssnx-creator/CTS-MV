import { NextResponse } from "next/server"
import { getRedisClient, initRedis, getActiveConnectionsForEngine } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { ProgressionStateManager } from "@/lib/progression-state-manager"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()
    
    // Read global engine state from Redis hash
    const engineHash = await client.hgetall("trade_engine:global") || {}
    console.log(`[v0] [Status] Redis state: ${JSON.stringify(engineHash)}`)
    const isGloballyRunning = engineHash.status === "running"
    const isGloballyPaused = engineHash.status === "paused"
    
    // Also check in-memory coordinator state
    const coordinatorRunning = coordinator?.isRunning() || false
    console.log(`[v0] [Status] Coordinator running: ${coordinatorRunning}`)
    
    // If coordinator says running but Redis says not, fix Redis
    if (coordinatorRunning && !isGloballyRunning) {
      console.log(`[v0] [Status] MISMATCH DETECTED: Coordinator running=true but Redis=stopped. Fixing Redis...`)
      await client.hset("trade_engine:global", {
        status: "running",
        started_at: new Date().toISOString(),
        coordinator_ready: "true",
      })
      console.log("[v0] [Status] ✓ Fixed: coordinator running but Redis said stopped. Updated Redis.")
    }
    
    // Effective running state: either Redis or coordinator says running
    const effectivelyRunning = isGloballyRunning || coordinatorRunning
    console.log(`[v0] [Status] Effective running state: ${effectivelyRunning} (redis=${isGloballyRunning}, coordinator=${coordinatorRunning})`)
    
    // Get active connections
    const connections = await getActiveConnectionsForEngine()
    console.log(`[v0] [Status] Found ${connections.length} active connections for engine`)
    
    if (connections.length === 0) {
      return NextResponse.json({
        success: true,
        running: effectivelyRunning,
        isRunning: effectivelyRunning,
        paused: isGloballyPaused,
        status: effectivelyRunning ? "running" : (isGloballyPaused ? "paused" : "stopped"),
        activeEngineCount: coordinator?.getActiveEngineCount() || 0,
        connections: [],
        summary: { total: 0, running: 0, stopped: 0, totalTrades: 0, totalPositions: 0, errors: 0 },
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
          const connectionRunning = effectivelyRunning && !isGloballyPaused

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
      running: effectivelyRunning,
      paused: isGloballyPaused,
      status: effectivelyRunning ? "running" : (isGloballyPaused ? "paused" : "stopped"),
      activeEngineCount: coordinator?.getActiveEngineCount() || 0,
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
