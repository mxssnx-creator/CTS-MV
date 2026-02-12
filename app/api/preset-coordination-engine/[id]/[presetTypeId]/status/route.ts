import { type NextRequest, NextResponse } from "next/server"
import { query, getDatabaseType } from "@/lib/db"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; presetTypeId: string }> },
) {
  try {
    const { id: connectionId, presetTypeId } = await params

    const isSqlite = getDatabaseType() === "sqlite"

    const stateQuery = isSqlite
      ? `SELECT * FROM preset_trade_engine_state WHERE connection_id = ? AND preset_id = ?`
      : `SELECT * FROM preset_trade_engine_state WHERE connection_id = $1 AND preset_id = $2`

    const states = await query<any>(stateQuery, [connectionId, presetTypeId])

    if (states.length === 0) {
      return NextResponse.json({
        status: "not_initialized",
        connectionId,
        presetTypeId,
      })
    }

    const state = states[0]

    const positionQuery = isSqlite
      ? `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN type = 'base' THEN 1 ELSE 0 END) as base_count,
          SUM(CASE WHEN type = 'main' THEN 1 ELSE 0 END) as main_count,
          SUM(CASE WHEN type = 'real' THEN 1 ELSE 0 END) as real_count
        FROM preset_pseudo_positions 
        WHERE connection_id = ? AND preset_id = ? AND status = 'active'
      `
      : `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN type = 'base' THEN 1 ELSE 0 END) as base_count,
          SUM(CASE WHEN type = 'main' THEN 1 ELSE 0 END) as main_count,
          SUM(CASE WHEN type = 'real' THEN 1 ELSE 0 END) as real_count
        FROM preset_pseudo_positions 
        WHERE connection_id = $1 AND preset_id = $2 AND status = 'active'
      `

    const positions = await query<any>(positionQuery, [connectionId, presetTypeId])
    const positionStats = positions[0] || { total: 0, base_count: 0, main_count: 0, real_count: 0 }

    return NextResponse.json({
      status: state.status,
      connectionId,
      presetTypeId,
      startedAt: state.started_at,
      stoppedAt: state.stopped_at,
      updatedAt: state.updated_at,
      positions: {
        total: Number(positionStats.total) || 0,
        base: Number(positionStats.base_count) || 0,
        main: Number(positionStats.main_count) || 0,
        real: Number(positionStats.real_count) || 0,
      },
    })
  } catch (error) {
    console.error("[v0] Failed to get preset coordination engine status:", error)

    return NextResponse.json(
      {
        error: "Failed to get status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
