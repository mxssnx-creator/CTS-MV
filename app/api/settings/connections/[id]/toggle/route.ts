import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"

// POST toggle connection enabled status and optionally start trade engine
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const { is_enabled, is_live_trade, is_preset_trade } = await request.json()

    console.log("[v0] [Toggle] Toggling connection:", connectionId, {
      is_enabled,
      is_live_trade,
      is_preset_trade,
    })

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      console.error("[v0] [Toggle] Connection not found:", connectionId)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    if (is_live_trade && !is_enabled) {
      console.warn("[v0] [Toggle] Cannot enable live trade without enabling connection first")
      return NextResponse.json(
        { error: "Invalid state", details: "Cannot enable live trade without enabling connection first" },
        { status: 400 },
      )
    }

    // Update connection in Redis
    const updatedConnection = {
      ...connection,
      is_enabled,
      is_live_trade: is_enabled ? is_live_trade : false,
      is_preset_trade: is_enabled ? is_preset_trade : false,
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)
    console.log("[v0] [Toggle] Connection state updated in Redis")

    // If enabling and has credentials, automatically start trade engine
    let tradeEngineStarted = false
    if (is_enabled && connection.api_key && connection.api_secret) {
      console.log("[v0] [Toggle] Connection enabled with credentials, starting trade engine...")
      
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:3000`
        const startResponse = await fetch(
          `${baseUrl}/api/trade-engine/start`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId }),
          }
        )

        const startData = await startResponse.json()

        if (startResponse.ok && startData.success) {
          tradeEngineStarted = true
          console.log("[v0] [Toggle] Trade engine started successfully for:", connectionId)
          await SystemLogger.logConnection(
            `Connection enabled and trade engine started automatically`,
            connectionId,
            "info",
            { tradeEngineStarted: true }
          )
        } else {
          console.warn("[v0] [Toggle] Trade engine start returned non-success status:", startResponse.status, startData)
          await SystemLogger.logConnection(
            `Connection enabled but trade engine start failed`,
            connectionId,
            "warning",
            { error: startData.error || "Unknown error" }
          )
        }
      } catch (engineError) {
        console.warn("[v0] [Toggle] Error calling trade engine start API:", engineError)
        // Don't fail the toggle operation if trade engine start fails
        await SystemLogger.logError(
          engineError,
          "trade-engine",
          `Automatic trade engine start failed for connection ${connectionId}`
        )
      }
    }

    await SystemLogger.logConnection(
      `Connection toggled to ${is_enabled ? "enabled" : "disabled"}${tradeEngineStarted ? " - trade engine started" : ""}`,
      connectionId,
      "info",
      { is_enabled, is_live_trade, is_preset_trade, tradeEngineStarted },
    )

    return NextResponse.json({ 
      success: true,
      connection: updatedConnection,
      tradeEngineStarted,
      message: `Connection ${is_enabled ? "enabled" : "disabled"}${tradeEngineStarted ? " and trade engine started automatically" : ""}`,
    })
  } catch (error) {
    console.error("[v0] [Toggle] Exception:", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/toggle")

    return NextResponse.json(
      {
        error: "Failed to toggle connection",
        details: errorMsg,
      },
      { status: 500 },
    )
  }
}
