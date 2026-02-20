import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getConnection, updateConnection, getAllConnections } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { loadSettingsAsync } from "@/lib/settings-storage"

// POST toggle live trading for a connection
// This controls the MAIN Trade Engine
// Main Engine starts ONLY if:
// 1. Connection is enabled (is_enabled = true)
// 2. Connection is active on dashboard (is_enabled_dashboard = true)
// 3. Live Trade toggle is enabled (is_live_trade = true)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const { is_live_trade } = await request.json()

    console.log("[v0] [Live Trade] Toggling Main Engine for:", connectionId, "enabled:", is_live_trade)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Check if connection is enabled AND active on dashboard
    const isEnabled = connection.is_enabled === "1" || connection.is_enabled === true
    const isActive = connection.is_enabled_dashboard === "1" || connection.is_enabled_dashboard === true

    if (!isEnabled) {
      return NextResponse.json({ error: "Connection must be enabled first" }, { status: 400 })
    }

    if (!isActive) {
      return NextResponse.json({ error: "Connection must be added to Active Connections first" }, { status: 400 })
    }

    // Update connection with is_live_trade flag
    const updatedConnection = {
      ...connection,
      is_live_trade: is_live_trade ? "1" : "0",
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)
    console.log("[v0] [Live Trade] Updated is_live_trade:", connectionId, "=", is_live_trade)

    // Start or stop Main Engine based on toggle
    const coordinator = getGlobalTradeEngineCoordinator()
    let engineStatus = "stopped"

    if (is_live_trade) {
      try {
        console.log("[v0] [Live Trade] Starting Main Engine for:", connection.name)
        const settings = await loadSettingsAsync()
        
        await coordinator.startEngine(connectionId, {
          connectionId,
          connection_name: connection.name,
          exchange: connection.exchange,
          indicationInterval: settings?.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 1,
          strategyInterval: settings?.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 1,
          realtimeInterval: settings?.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 0.05,
        })
        
        engineStatus = "running"
        console.log("[v0] [Live Trade] Main Engine started successfully")
        await SystemLogger.logConnection(
          `Main Engine started via Live Trade toggle`,
          connectionId,
          "info",
          { is_live_trade: true },
        )
      } catch (error) {
        console.error("[v0] [Live Trade] Failed to start Main Engine:", error)
        engineStatus = "error"
        await SystemLogger.logError(error, "api", `Start Main Engine for ${connectionId}`)
        return NextResponse.json(
          {
            error: "Failed to start Main Engine",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        )
      }
    } else {
      try {
        console.log("[v0] [Live Trade] Stopping Main Engine for:", connection.name)
        await coordinator.stopEngine(connectionId)
        engineStatus = "stopped"
        console.log("[v0] [Live Trade] Main Engine stopped successfully")
        await SystemLogger.logConnection(
          `Main Engine stopped via Live Trade toggle`,
          connectionId,
          "info",
          { is_live_trade: false },
        )
      } catch (error) {
        console.warn("[v0] [Live Trade] Failed to stop Main Engine:", error)
        // Don't fail the request if stop fails - engine might not be running
      }
    }

    return NextResponse.json({
      success: true,
      is_live_trade,
      engineStatus,
      connection: updatedConnection,
      message: `Main Engine ${is_live_trade ? "enabled (starting...)" : "disabled"}`,
    })
  } catch (error) {
    console.error("[v0] [Live Trade] Exception:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/live-trade")
    return NextResponse.json(
      {
        error: "Failed to toggle live trade",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
