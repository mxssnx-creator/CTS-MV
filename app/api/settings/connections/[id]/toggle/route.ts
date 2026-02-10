import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"

// POST toggle connection enabled status
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const { is_enabled, is_live_trade, is_preset_trade } = await request.json()

    console.log("[v0] Toggling connection:", connectionId, {
      is_enabled,
      is_live_trade,
      is_preset_trade,
    })

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      console.error("[v0] Connection not found:", connectionId)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    if (is_live_trade && !is_enabled) {
      console.warn("[v0] Cannot enable live trade without enabling connection first")
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

    await SystemLogger.logConnection(
      `Connection toggled: ${connection.name} - enabled: ${is_enabled}, live: ${is_live_trade}`,
      connectionId,
      "info",
      { is_enabled, is_live_trade, is_preset_trade },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to toggle connection:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/toggle")

    return NextResponse.json(
      {
        error: "Failed to toggle connection",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
