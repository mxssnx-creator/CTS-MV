import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { SystemLogger } from "@/lib/system-logger"

export async function POST(request: NextRequest) {
  try {
    let connectionId: string | undefined
    try {
      const text = await request.text()
      if (text && text.trim()) {
        const body = JSON.parse(text)
        connectionId = body.connectionId
      }
    } catch {
      // Empty or invalid body - stop all engines
    }

    console.log("[v0] [Trade Engine] Stopping trade engine for connection:", connectionId || "all")

    await initRedis()
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()

    // If no connectionId, stop all engines
    if (!connectionId) {
      try {
        if (coordinator) await coordinator.stopAll()
      } catch { /* ignore */ }
      
      // Set global state in Redis
      await client.hset("trade_engine:global", { 
        status: "stopped", 
        stopped_at: new Date().toISOString(),
        coordinator_ready: "false"
      })
      await client.saveSnapshot()
      
      console.log("[v0] [Trade Engine] All engines stopped, state saved to Redis")
      return NextResponse.json({ success: true, message: "All trade engines stopped" })
    }

    // Verify connection exists in Redis
    const { getAllConnections } = await import("@/lib/redis-db")
    const connections = await getAllConnections()
    const connection = connections.find((c: any) => c.id === connectionId)

    if (!connection) {
      console.error("[v0] [Trade Engine] Connection not found:", connectionId)
      return NextResponse.json(
        { success: false, error: "Connection not found" },
        { status: 404 }
      )
    }

    try {
      // Stop the engine via coordinator
      await coordinator.stopEngine(connectionId)

      await SystemLogger.logTradeEngine(
        `Trade engine stopped successfully for connection: ${connection.name}`,
        "info",
        { connectionId, connectionName: connection.name }
      )

      console.log("[v0] [Trade Engine] Engine stopped successfully for connection:", connectionId)

      return NextResponse.json({
        success: true,
        message: "Trade engine stopped successfully",
        connectionId,
        connectionName: connection.name,
      })
    } catch (stopError) {
      console.error("[v0] [Trade Engine] Failed to stop engine:", stopError)
      await SystemLogger.logTradeEngine(
        `Failed to stop trade engine: ${stopError}`,
        "error",
        { connectionId, error: stopError instanceof Error ? stopError.message : String(stopError) }
      )

      return NextResponse.json(
        {
          success: false,
          error: "Failed to stop trade engine",
          details: stopError instanceof Error ? stopError.message : "Unknown error",
        },
        { status: 500 },
      )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] [Trade Engine] Failed to process stop request:", errorMessage)
    await SystemLogger.logError(error, "trade-engine", "POST /api/trade-engine/stop")
    
    return NextResponse.json(
      {
        success: false,
        error: "Failed to stop trade engine",
        details: errorMessage,
      },
      { status: 500 },
    )
  }
}
