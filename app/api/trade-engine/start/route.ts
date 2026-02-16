import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getAllConnections, getConnection, getRedisClient } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { SystemLogger } from "@/lib/system-logger"

export const dynamic = "force-dynamic"

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
      // Empty or invalid body - start all engines
    }

    console.log("[v0] [Trade Engine] Starting for:", connectionId || "all")
    await SystemLogger.logTradeEngine(`Starting: ${connectionId || "all"}`, "info", { connectionId })

    const coordinator = getGlobalTradeEngineCoordinator()
    
    if (!coordinator) {
      return NextResponse.json({ error: "Coordinator not initialized" }, { status: 503 })
    }

    // Start all enabled connections if no specific ID provided
    if (!connectionId) {
      await initRedis()
      const connections = await getAllConnections()
      const enabledConnections = connections.filter((c) => c.is_enabled === true || c.is_enabled === "true")
      
      console.log("[v0] Found", enabledConnections.length, "enabled connections")
      
      if (enabledConnections.length === 0) {
        return NextResponse.json({
          success: false,
          error: "No enabled connections found",
        }, { status: 400 })
      }

      await coordinator.startAll()
      
      // Set global state in Redis
      const client = getRedisClient()
      await client.hset("trade_engine:global", { status: "running", started_at: new Date().toISOString() })

      return NextResponse.json({
        success: true,
        message: `Started ${enabledConnections.length} trade engines`,
        count: enabledConnections.length,
      })
    }

    // Check if already running
    const existingManager = coordinator.getEngineManager(connectionId)
    if (existingManager) {
      return NextResponse.json({
        success: true,
        message: "Trade engine already running",
      })
    }

    // Load connection from Redis
    await initRedis()
    let connection = await getConnection(connectionId)
    
    if (!connection) {
      const allConnections = await getAllConnections()
      connection = allConnections.find(c => c.id === connectionId)
    }

    if (!connection || (connection.is_enabled !== true && connection.is_enabled !== "true")) {
      await SystemLogger.logTradeEngine(`Connection not found: ${connectionId}`, "error")
      return NextResponse.json({ error: "Connection not found or not enabled" }, { status: 404 })
    }

    console.log("[v0] Starting engine for:", connection.name)

    // Start engine with coordinator
    const config = {
      connectionId: connection.id,
      connection_name: connection.name,
      exchange: connection.exchange,
    }

    await coordinator.startEngine(connectionId, config)

    console.log("[v0] Engine started for:", connectionId)
    await SystemLogger.logTradeEngine(`Started: ${connection.name}`, "info", { connectionId })

    return NextResponse.json({
      success: true,
      message: `Trade engine started for ${connection.name}`,
      connectionId,
    })

  } catch (error) {
    console.error("[v0] Failed to start:", error)
    await SystemLogger.logError(error, "trade-engine", "POST /api/trade-engine/start")

    return NextResponse.json(
      {
        error: "Failed to start trade engine",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
