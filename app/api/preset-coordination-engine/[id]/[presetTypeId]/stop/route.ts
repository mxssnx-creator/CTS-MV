import { type NextRequest, NextResponse } from "next/server"
import { execute, getDatabaseType } from "@/lib/db"
import { SystemLogger } from "@/lib/system-logger"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; presetTypeId: string }> },
) {
  try {
    const { id: connectionId, presetTypeId } = await params

    console.log("[v0] Stopping preset coordination engine:", { connectionId, presetTypeId })
    await SystemLogger.logTradeEngine(`Stopping preset coordination engine for connection ${connectionId}`, "info", {
      connectionId,
      presetTypeId,
    })

    const isSqlite = getDatabaseType() === "sqlite"

    const stateQuery = isSqlite
      ? `
        UPDATE preset_trade_engine_state 
        SET status = 'stopped', stopped_at = datetime('now'), updated_at = datetime('now')
        WHERE connection_id = ? AND preset_id = ?
      `
      : `
        UPDATE preset_trade_engine_state 
        SET status = 'stopped', stopped_at = NOW(), updated_at = NOW()
        WHERE connection_id = $1 AND preset_id = $2
      `

    await execute(stateQuery, [connectionId, presetTypeId])

    const updateConnectionQuery = isSqlite
      ? `UPDATE exchange_connections SET is_preset_trade = 0, updated_at = datetime('now') WHERE id = ?`
      : `UPDATE exchange_connections SET is_preset_trade = false, updated_at = NOW() WHERE id = $1`

    await execute(updateConnectionQuery, [connectionId])

    await SystemLogger.logTradeEngine(`Preset coordination engine stopped successfully`, "info", {
      connectionId,
      presetTypeId,
      status: "stopped",
    })

    return NextResponse.json({
      success: true,
      message: "Preset coordination engine stopped",
      connectionId,
      presetTypeId,
      status: "stopped",
    })
  } catch (error) {
    console.error("[v0] Failed to stop preset coordination engine:", error)
    await SystemLogger.logError(error, "trade-engine", "Failed to stop preset coordination engine")

    return NextResponse.json(
      {
        error: "Failed to stop preset coordination engine",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
