import { NextResponse } from "next/server"
import { initRedis, verifyRedisHealth, getAllConnections, getRedisClient } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    console.log("[v0] Health check initiated...")

    // Check Redis connection
    const redisHealthy = await verifyRedisHealth()
    if (!redisHealthy) {
      console.error("[v0] Redis health check failed")
      return NextResponse.json({
        status: "degraded",
        redis: "unhealthy",
        message: "Redis connection is not healthy",
      }, { status: 503 })
    }

    console.log("[v0] Redis health check passed")

    // Get all connections from Redis
    const connections = await getAllConnections()
    const enabledConnections = connections.filter(c => c.is_enabled)

    // Get trade engine states
    const client = getRedisClient()
    let runningEngines = 0
    let totalTrades = 0
    let totalPositions = 0

    for (const connection of connections) {
      try {
        const stateKey = `trade_engine_state:${connection.id}`
        const state = await (client as any).hGetAll(stateKey)
        if (state?.is_running === "1") {
          runningEngines++
        }

        const trades = await (client as any).sMembers(`trades:${connection.id}`) || []
        const positions = await (client as any).sMembers(`positions:${connection.id}`) || []
        totalTrades += trades.length
        totalPositions += positions.length
      } catch (error) {
        console.warn(`[v0] Failed to get metrics for connection ${connection.id}:`, error)
      }
    }

    const response = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      redis: {
        healthy: true,
        connected: true,
      },
      system: {
        totalConnections: connections.length,
        enabledConnections: enabledConnections.length,
        runningEngines: runningEngines,
        totalTrades: totalTrades,
        totalOpenPositions: totalPositions,
      },
    }

    console.log("[v0] Health check completed successfully")
    return NextResponse.json(response)
  } catch (error) {
    console.error("[v0] Health check failed:", error)
    return NextResponse.json({
      status: "unhealthy",
      redis: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 503 })
  }
}
