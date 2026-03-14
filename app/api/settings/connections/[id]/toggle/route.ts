import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"

// POST toggle connection enabled status
// NOTE: Trade engines DO NOT start here
// Main/Preset engines are controlled independently via their toggle endpoints:
// - /api/settings/connections/[id]/live-trade (controls Main Engine)
// - /api/settings/connections/[id]/preset-type (controls Preset Engine)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const body = await request.json()
    const { is_enabled } = body

    console.log("[v0] [Toggle] Toggling connection enabled:", connectionId, "enabled:", is_enabled)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      console.error("[v0] [Toggle] Connection not found:", connectionId)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Update connection in Redis with updated_at timestamp
    const updatedConnection = {
      ...connection,
      is_enabled: is_enabled ? "1" : "0",
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)
    console.log("[v0] [Toggle] Connection is_enabled updated:", connectionId, "=", is_enabled)

    // Log the change but do NOT start/stop engines here
    // Engine control is separate via live-trade and preset-type endpoints
    await SystemLogger.logConnection(
      `Connection toggled: is_enabled=${is_enabled}. Engines controlled separately via live-trade/preset-type endpoints.`,
      connectionId,
      "info",
      { is_enabled },
    )

    return NextResponse.json({
      success: true,
      connection: updatedConnection,
      message: `Connection ${is_enabled ? "enabled" : "disabled"}. Trade engines are controlled separately.`,
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
