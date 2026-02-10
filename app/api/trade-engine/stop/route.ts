import { type NextRequest, NextResponse } from "next/server"
import { loadConnections } from "@/lib/file-storage"
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

    const coordinator = getGlobalTradeEngineCoordinator()

    if (!coordinator) {
      console.error("[v0] [Trade Engine] Coordinator not initialized")
      return NextResponse.json(
        { success: false, error: "Trade engine coordinator not initialized" },
        { status: 503 }
      )
    }

    // If no connectionId, stop all engines
    if (!connectionId) {
      try {
        await coordinator.stopAll()
        return NextResponse.json({ success: true, message: "All trade engines stopped" })
      } catch (stopAllError) {
        return NextResponse.json({ success: true, message: "Trade engines stop requested" })
      }
    }

    // Verify connection exists
    const connections = loadConnections()
    
    if (!Array.isArray(connections)) {
      console.error("[v0] [Trade Engine] Connections is not an array:", typeof connections)
      return NextResponse.json(
        { success: false, error: "Invalid connections data" },
        { status: 500 }
      )
    }

    const connection = connections.find((c) => c.id === connectionId)

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
