import { NextRequest, NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { useConnectionState } from "@/lib/connection-state"
import { SystemLogger } from "@/lib/system-logger"

export async function GET(request: NextRequest) {
  try {
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()
    const logger = SystemLogger.getInstance()

    console.log("[v0] [Trade Engine] Fetching trade engine status with progression info...")

    // Get all connections
    const connectionIds = (await client.smembers("connections")) || []
    console.log(`[v0] [Trade Engine] Found ${connectionIds.length} total connections`)

    let runningCount = 0
    let totalTrades = 0
    let totalPositions = 0
    let totalErrors = 0
    const engines: any[] = []

    for (const connectionId of connectionIds) {
      try {
        const stateKey = `trade_engine_state:${connectionId}`
        const state = await client.hgetall(stateKey)

        // Get trade metrics - use smembers for set operations
        const tradesKey = `trades:${connectionId}`
        const positionsKey = `positions:${connectionId}`
        const trades = (await client.smembers(tradesKey)) || []
        const positions = (await client.smembers(positionsKey)) || []

        const engineStatus = {
          connectionId,
          status: state?.status || "idle",
          running: coordinator.getEngineManager(connectionId) ? "running" : "stopped",
          trades: trades.length,
          positions: positions.length,
          progressionData: state?.progressionData ? JSON.parse(state.progressionData) : null,
        }

        if (engineStatus.running === "running") runningCount++
        totalTrades += engineStatus.trades
        totalPositions += engineStatus.positions

        engines.push(engineStatus)
      } catch (error) {
        console.error(
          `[v0] [Trade Engine] Failed to get state for connection ${connectionId}:`,
          error
        )
        totalErrors++
      }
    }

    await logger.logTradeEngine("status_check", {
      timestamp: new Date().toISOString(),
      running_count: runningCount,
      total_connections: connectionIds.length,
      total_trades: totalTrades,
      total_positions: totalPositions,
      total_errors: totalErrors,
    })

    console.log(
      `[v0] [Trade Engine] Status summary - running: ${runningCount} trades: ${totalTrades} positions: ${totalPositions} errors: ${totalErrors}`
    )

    return NextResponse.json(
      {
        status: "ok",
        summary: {
          running: runningCount,
          total: connectionIds.length,
          trades: totalTrades,
          positions: totalPositions,
          errors: totalErrors,
        },
        engines,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[v0] [Trade Engine] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
