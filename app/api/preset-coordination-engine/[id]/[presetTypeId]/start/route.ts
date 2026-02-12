import { type NextRequest, NextResponse } from "next/server"
import { execute, query, getDatabaseType } from "@/lib/db"
import { SystemLogger } from "@/lib/system-logger"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; presetTypeId: string }> },
) {
  try {
    const { id: connectionId, presetTypeId } = await params

    console.log("[v0] Starting preset coordination engine:", { connectionId, presetTypeId })
    await SystemLogger.logTradeEngine(`Starting preset coordination engine for connection ${connectionId}`, "info", {
      connectionId,
      presetTypeId,
    })

    const isSqlite = getDatabaseType() === "sqlite"

    const connectionQuery = isSqlite
      ? `SELECT * FROM exchange_connections WHERE id = ? AND is_enabled = 1`
      : `SELECT * FROM exchange_connections WHERE id = $1 AND is_enabled = true`

    const connections = await query<any>(connectionQuery, [connectionId])

    if (connections.length === 0) {
      return NextResponse.json({ error: "Connection not found or not enabled" }, { status: 404 })
    }

    const presetTypeQuery = isSqlite
      ? `SELECT * FROM preset_types WHERE id = ?`
      : `SELECT * FROM preset_types WHERE id = $1`

    const presetTypes = await query<any>(presetTypeQuery, [presetTypeId])

    if (presetTypes.length === 0) {
      return NextResponse.json({ error: "Preset type not found" }, { status: 404 })
    }

    const stateQuery = isSqlite
      ? `
        INSERT INTO preset_trade_engine_state (connection_id, preset_id, status, started_at, updated_at)
        VALUES (?, ?, 'running', datetime('now'), datetime('now'))
        ON CONFLICT(connection_id, preset_id) DO UPDATE SET
          status = 'running',
          started_at = datetime('now'),
          stopped_at = NULL,
          updated_at = datetime('now')
      `
      : `
        INSERT INTO preset_trade_engine_state (connection_id, preset_id, status, started_at, updated_at)
        VALUES ($1, $2, 'running', NOW(), NOW())
        ON CONFLICT(connection_id, preset_id) DO UPDATE SET
          status = 'running',
          started_at = NOW(),
          stopped_at = NULL,
          updated_at = NOW()
      `

    await execute(stateQuery, [connectionId, presetTypeId])

    const updateConnectionQuery = isSqlite
      ? `UPDATE exchange_connections SET is_preset_trade = 1, preset_type_id = ?, updated_at = datetime('now') WHERE id = ?`
      : `UPDATE exchange_connections SET is_preset_trade = true, preset_type_id = $1, updated_at = NOW() WHERE id = $2`

    await execute(updateConnectionQuery, [presetTypeId, connectionId])

    await SystemLogger.logTradeEngine(`Preset coordination engine started successfully`, "info", {
      connectionId,
      presetTypeId,
      status: "running",
    })

    return NextResponse.json({
      success: true,
      message: "Preset coordination engine started",
      connectionId,
      presetTypeId,
      status: "running",
    })
  } catch (error) {
    console.error("[v0] Failed to start preset coordination engine:", error)
    await SystemLogger.logError(error, "trade-engine", "Failed to start preset coordination engine")

    return NextResponse.json(
      {
        error: "Failed to start preset coordination engine",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
