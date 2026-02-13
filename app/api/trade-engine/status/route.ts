import { NextResponse, type NextRequest } from "next/server"
import { getAllConnections, initRedis, getRedisClient } from "@/lib/redis-db"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const connectionId = searchParams.get("connectionId")

    await initRedis()
    const client = getRedisClient()

    // Per-connection status
    if (connectionId) {
      const connection = await (client as any).hgetall(`connection:${connectionId}`)
      if (!connection || Object.keys(connection).length === 0) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 })
      }

      const stateKey = `trade_engine_state:${connectionId}`
      const state = await (client as any).hgetall(stateKey) || {}
      const trades = (await (client as any).smembers(`trades:${connectionId}`)) || []
      const positions = (await (client as any).smembers(`positions:${connectionId}`)) || []

      const isRunning = state.is_running === "1"
      const errorCount = parseInt(state.error_count || "0")
      const cycleCount = parseInt(state.cycle_count || "0")
      const successCount = parseInt(state.success_count || "0")

      return NextResponse.json({
        engineStatus: {
          status: isRunning ? "running" : "idle",
          connection_id: connectionId,
          connection_name: connection.name,
          exchange: connection.exchange,
          progression: {
            cycles_completed: cycleCount,
            successful_cycles: successCount,
            cycle_success_rate: cycleCount > 0 ? ((successCount / cycleCount) * 100).toFixed(2) : "0",
          },
          trades: { total: trades.length, open_positions: positions.length },
          performance: { error_count: errorCount, health_status: errorCount === 0 ? "healthy" : "unhealthy" },
        },
      })
    }

    // All connections status
    const connections = await getAllConnections()
    const engineStates = []
    let totalRunning = 0
    let totalTrades = 0
    let totalPositions = 0

    for (const conn of connections) {
      try {
        const stateKey = `trade_engine_state:${conn.id}`
        const state = await (client as any).hgetall(stateKey) || {}
        const trades = (await (client as any).smembers(`trades:${conn.id}`)) || []
        const positions = (await (client as any).smembers(`positions:${conn.id}`)) || []

        const isRunning = state.is_running === "1"
        const errorCount = parseInt(state.error_count || "0")
        const cycleCount = parseInt(state.cycle_count || "0")
        const successCount = parseInt(state.success_count || "0")

        engineStates.push({
          connection_id: conn.id,
          connection_name: conn.name,
          exchange: conn.exchange,
          enabled: conn.is_enabled === "1" || conn.is_enabled === true,
          active: conn.is_active === "1" || conn.is_active === true,
          is_running: isRunning,
          progression: {
            cycles_completed: cycleCount,
            successful_cycles: successCount,
            cycle_success_rate: cycleCount > 0 ? ((successCount / cycleCount) * 100).toFixed(2) : "0",
          },
          trades: { total: trades.length, open_positions: positions.length },
          performance: { error_count: errorCount, health_status: errorCount === 0 ? "healthy" : "unhealthy" },
        })

        if (isRunning) totalRunning++
        totalTrades += trades.length
        totalPositions += positions.length
      } catch (err) {
        console.error(`[v0] Failed to get state for ${conn.id}:`, err)
      }
    }

    return NextResponse.json({
      engineStates,
      summary: { running: totalRunning, total: connections.length, trades: totalTrades, positions: totalPositions },
    })
  } catch (error) {
    console.error("[v0] Trade engine status error:", error)
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 })
  }
}
