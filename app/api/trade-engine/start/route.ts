import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getAllConnections, getConnection } from "@/lib/redis-db"
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
      // Empty or invalid body - start all engines
    }

    console.log("[v0] [Trade Engine] Starting trade engine for connection:", connectionId || "all")
    await SystemLogger.logTradeEngine(`Starting trade engine for connection: ${connectionId}`, "info", { connectionId })

    const coordinator = getGlobalTradeEngineCoordinator()
    
    if (!coordinator) {
      console.error("[v0] [Trade Engine] Coordinator not initialized")
      return NextResponse.json(
        { error: "Trade engine coordinator not initialized" },
        { status: 503 }
      )
    }

    // If no connectionId, start all enabled connections
    if (!connectionId) {
      console.log("[v0] [Trade Engine] Starting all enabled connections")
      try {
        await initRedis()
        const connections = await getAllConnections()
        const enabledConnections = connections.filter((c) => c.is_enabled)
        
        if (enabledConnections.length === 0) {
          return NextResponse.json({
            success: false,
            error: "No enabled connections found",
          }, { status: 400 })
        }

        console.log("[v0] [Trade Engine] Starting engines for", enabledConnections.length, "enabled connections")
        
        await coordinator.startAll()

        return NextResponse.json({
          success: true,
          message: `Started ${enabledConnections.length} trade engines`,
          count: enabledConnections.length,
        })
      } catch (startAllError) {
        console.error("[v0] [Trade Engine] Failed to start all engines:", startAllError)
        return NextResponse.json({
          error: "Failed to start all trade engines",
          details: startAllError instanceof Error ? startAllError.message : "Unknown error",
        }, { status: 500 })
      }
    }

    // Check if already running
    const existingManager = coordinator.getEngineManager(connectionId)
    if (existingManager) {
      console.log("[v0] [Trade Engine] Already running for connection:", connectionId)
      return NextResponse.json({
        success: true,
        message: "Trade engine already running for this connection",
      })
    }

    // Load connection from Redis
    let connection
    try {
      await initRedis()
      connection = await getConnection(connectionId)

      if (!connection || !connection.is_enabled) {
        console.error("[v0] [Trade Engine] Connection not found or not enabled:", connectionId)
        await SystemLogger.logTradeEngine(`Connection not found or not enabled: ${connectionId}`, "error", {
          connectionId,
        })
        return NextResponse.json({ error: "Connection not found or not enabled" }, { status: 404 })
      }

      console.log("[v0] [Trade Engine] Loaded connection from Redis:", connection.name)
    } catch (redisError) {
      console.error("[v0] [Trade Engine] Failed to load connection from Redis:", redisError)
      return NextResponse.json({ error: "Failed to load connection configuration" }, { status: 500 })
    }

    // Load settings from Redis
    let indicationInterval = 5
    let strategyInterval = 10
    let realtimeInterval = 3

    try {
      const { getSettings } = await import("@/lib/redis-db")
      const settings = await getSettings("all_settings") || {}
      indicationInterval = settings.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 5
      strategyInterval = settings.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 10
      realtimeInterval = settings.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 3
      console.log("[v0] [Trade Engine] Loaded settings - indicationInterval:", indicationInterval, "strategyInterval:", strategyInterval, "realtimeInterval:", realtimeInterval)
    } catch (settingsError) {
      console.warn("[v0] [Trade Engine] Could not load settings from Redis, using defaults:", settingsError)
    }

    try {
      await coordinator.startEngine(connectionId, {
        connectionId,
        indicationInterval,
        strategyInterval,
        realtimeInterval,
      })

      console.log("[v0] [Trade Engine] Trade engine started successfully via coordinator")
      await SystemLogger.logTradeEngine(`Trade engine started successfully for connection: ${connection.name}`, "info", {
        connectionId,
        connectionName: connection.name,
      })

      return NextResponse.json({
        success: true,
        message: "Trade engine started successfully",
        connectionId,
        connectionName: connection.name,
      })
    } catch (startError) {
      console.error("[v0] [Trade Engine] Failed to start trade engine:", startError)
      await SystemLogger.logTradeEngine(`Failed to start trade engine: ${startError}`, "error", { connectionId })
      return NextResponse.json(
        {
          error: "Failed to start trade engine",
          details: startError instanceof Error ? startError.message : "Unknown error",
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("[v0] [Trade Engine] Failed to start:", error)
    await SystemLogger.logError(error, "trade-engine", "POST /api/trade-engine/start")

    return NextResponse.json(
      {
        error: "Failed to start trade engine",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
