import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { loadSettingsAsync } from "@/lib/settings-storage"

// POST toggle connection enabled status and start/stop trade engine immediately
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const body = await request.json()
    const { is_enabled } = body

    console.log("[v0] [Toggle] Toggling connection:", connectionId, "enabled:", is_enabled)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      console.error("[v0] [Toggle] Connection not found:", connectionId)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Update connection in Redis
    const updatedConnection = {
      ...connection,
      is_enabled,
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)
    console.log("[v0] [Toggle] Connection state updated in Redis")

    let engineStarted = false
    let engineMessage = ""

    try {
      const coordinator = getGlobalTradeEngineCoordinator()

      if (is_enabled && connection.api_key && connection.api_secret) {
        // Enable: Immediately start the trade engine
        console.log("[v0] [Toggle] Connection enabled - starting trade engine for:", connection.name)

        const settings = await loadSettingsAsync()
        await coordinator.startEngine(connectionId, {
          connectionId,
          indicationInterval: settings?.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 5,
          strategyInterval: settings?.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 10,
          realtimeInterval: settings?.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 3,
        })

        engineStarted = true
        engineMessage = `Trade engine started for ${connection.name}`
        console.log("[v0] [Toggle] Trade engine started successfully")

        await SystemLogger.logConnection(
          `Connection enabled and trade engine started automatically`,
          connectionId,
          "info",
          { engineStarted: true },
        )
      } else if (is_enabled && (!connection.api_key || !connection.api_secret)) {
        // Enable without credentials: just mark as enabled
        engineMessage = `Connection enabled (add API credentials to auto-start trade engine)`
        console.log("[v0] [Toggle] Connection enabled but no credentials - trade engine not started")

        await SystemLogger.logConnection(
          `Connection enabled but credentials missing`,
          connectionId,
          "info",
          { credentialsMissing: true },
        )
      } else if (!is_enabled) {
        // Disable: Stop the trade engine
        console.log("[v0] [Toggle] Connection disabled - stopping trade engine for:", connection.name)

        try {
          await coordinator.stopEngine(connectionId)
          console.log("[v0] [Toggle] Trade engine stopped successfully")
        } catch (stopError) {
          console.warn("[v0] [Toggle] Failed to stop engine, may not be running:", stopError)
        }

        engineMessage = `Connection disabled and trade engine stopped`

        await SystemLogger.logConnection(
          `Connection disabled and trade engine stopped`,
          connectionId,
          "info",
          { engineStarted: false },
        )
      }
    } catch (engineError) {
      console.error("[v0] [Toggle] Trade engine operation failed:", engineError)
      engineMessage = `Connection ${is_enabled ? "enabled" : "disabled"} but engine control failed`

      try {
        await SystemLogger.logError(
          engineError,
          "trade-engine",
          `Toggle trade engine for connection ${connectionId}`,
        )
      } catch (logError) {
        console.warn("[v0] [Toggle] Failed to log engine error:", logError)
      }
    }

    return NextResponse.json({
      success: true,
      connection: updatedConnection,
      engineStarted,
      engineStatus: is_enabled ? (engineStarted ? "running" : "starting") : "stopped",
      message: engineMessage,
    })
  } catch (error) {
    console.error("[v0] [Toggle] Exception:", error)
    const errorMsg = error instanceof Error ? error.message : String(error)

    try {
      await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/toggle")
    } catch (logError) {
      console.warn("[v0] [Toggle] Failed to log error:", logError)
    }

    return NextResponse.json(
      {
        error: "Failed to toggle connection",
        details: errorMsg,
      },
      { status: 500 },
    )
  }
}
