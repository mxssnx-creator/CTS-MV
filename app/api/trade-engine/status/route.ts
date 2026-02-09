import { NextResponse } from "next/server"
import { getAllConnections, initRedis, getRedisClient } from "@/lib/redis-db"

export async function GET() {
  try {
    console.log("[v0] [Trade Engine] Fetching trade engine status...")

    await initRedis()
    const client = getRedisClient()

    // Get all connections
    const connections = await getAllConnections()

    // Get trade engine state for each connection
    const engineStates = []
    for (const connection of connections) {
      try {
        const stateKey = `trade_engine_state:${connection.id}`
        const state = await (client as any).hGetAll(stateKey)
        
        engineStates.push({
          connection_id: connection.id,
          connection_name: connection.name,
          exchange: connection.exchange,
          is_running: state?.is_running === "1" || state?.is_running === true,
          last_started_at: state?.last_started_at || null,
          last_stopped_at: state?.last_stopped_at || null,
          error_count: parseInt(state?.error_count || "0"),
          last_error: state?.last_error || null,
        })
      } catch (error) {
        console.warn(`[v0] Failed to get state for connection ${connection.id}:`, error)
      }
    }

    console.log("[v0] [Trade Engine] Status retrieved for", engineStates.length, "connections")

    return NextResponse.json({
      running: engineStates.some((s) => s.is_running),
      connections: engineStates,
      totalConnections: engineStates.length,
    })
  } catch (error) {
    console.error("[v0] [Trade Engine] Failed to get status:", error)
    return NextResponse.json({
      running: false,
      message: "Failed to get status",
      connections: [],
    })
  }
}
