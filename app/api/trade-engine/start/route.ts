import { type NextRequest, NextResponse } from "next/server"
import { loadConnections, loadSettings } from "@/lib/file-storage"
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

    // Check if already running
    const existingManager = coordinator.getEngineManager(connectionId)
    if (existingManager) {
      console.log("[v0] [Trade Engine] Already running for connection:", connectionId)
      return NextResponse.json({
        success: true,
        message: "Trade engine already running for this connection",
      })
    }

    // Load connection from file storage
    let connection
    try {
      const connections = loadConnections()
      
      if (!Array.isArray(connections)) {
        console.error("[v0] [Trade Engine] Connections is not an array:", typeof connections)
        return NextResponse.json({ error: "Invalid connections data" }, { status: 500 })
      }

      connection = connections.find((c) => c.id === connectionId && c.is_enabled)

      if (!connection) {
        console.error("[v0] [Trade Engine] Connection not found or not enabled:", connectionId)
        await SystemLogger.logTradeEngine(`Connection not found or not enabled: ${connectionId}`, "error", {
          connectionId,
        })
        return NextResponse.json({ error: "Connection not found or not enabled" }, { status: 404 })
      }

      console.log("[v0] [Trade Engine] Loaded connection from file storage:", connection.name)
    } catch (fileError) {
      console.error("[v0] [Trade Engine] Failed to load connection from file:", fileError)
      return NextResponse.json({ error: "Failed to load connection configuration" }, { status: 500 })
    }

    // Load settings from file storage
    let indicationInterval = 5
    let strategyInterval = 10
    let realtimeInterval = 3

    try {
      const settings = loadSettings()
      indicationInterval = settings.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 5
      strategyInterval = settings.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 10
      realtimeInterval = settings.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 3
      console.log("[v0] [Trade Engine] Loaded settings - indicationInterval:", indicationInterval, "strategyInterval:", strategyInterval, "realtimeInterval:", realtimeInterval)
    } catch (settingsError) {
      console.warn("[v0] [Trade Engine] Could not load settings from file, using defaults:", settingsError)
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
