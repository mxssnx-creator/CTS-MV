import { NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { getAllConnections } from "@/lib/redis-db"

export async function GET() {
  try {
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()
    const connections = await getAllConnections()

    console.log("[v0] [Trade Engine] Fetching trade engine status with progression info...")
    console.log(`[v0] [Trade Engine] Found ${connections.length} total connections`)

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

          const manager = coordinator.getEngineManager(connection.id)
          const isRunning = manager !== undefined

          if (isRunning) running++
          totalTrades += trades.length
          totalPositions += positions.length

          return {
            id: connection.id,
            name: connection.name,
            exchange: connection.exchange,
            enabled: connection.is_enabled === true || connection.is_enabled === "true",
            active: connection.is_active === true || connection.is_active === "true",
            status: isRunning ? "running" : "stopped",
            trades: trades.length,
            positions: positions.length,
            state: state || {},
            progression: {
              cycles_completed: state?.cycles_completed || "0",
              successful_cycles: state?.successful_cycles || "0",
              cycle_success_rate: state?.cycle_success_rate || "0%",
            },
          }
        } catch (error) {
          console.error(
            `[v0] [Trade Engine] Failed to get state for connection ${connection.id}:`,
            error,
          )
          totalErrors++
          return {
            id: connection.id,
            name: connection.name,
            exchange: connection.exchange,
            enabled: connection.is_enabled === true || connection.is_enabled === "true",
            active: connection.is_active === true || connection.is_active === "true",
            status: "error",
            trades: 0,
            positions: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          }
        }
      }),
    )

    console.log(`[v0] [Trade Engine] Status summary - running: ${running} trades: ${totalTrades} positions: ${totalPositions} errors: ${totalErrors}`)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_connections: connections.length,
        running: running,
        total_trades: totalTrades,
        total_positions: totalPositions,
        total_errors: totalErrors,
      },
      statuses,
    })
  } catch (error) {
    console.error("[v0] [Trade Engine] Error fetching status:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
