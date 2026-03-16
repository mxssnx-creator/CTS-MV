import { NextResponse } from "next/server"
import { getSettings } from "@/lib/redis-persistence"
import { query } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const connectionId = searchParams.get("connection_id")

    if (!connectionId) {
      return NextResponse.json({ error: "connection_id required" }, { status: 400 })
    }

    // Get indication and strategy cycle counts from Redis state
    const engState = await getSettings(`trade_engine_state:${connectionId}`)
    const engHealth = await getSettings(`trade_engine_health:${connectionId}`)
    const progState = await getSettings(`progression_state:${connectionId}`)

    const indicationCycleCount = (engState as any)?.indication_cycle_count || (engHealth as any)?.indications?.cycleCount || 0
    const strategyCycleCount = (engState as any)?.strategy_cycle_count || (engHealth as any)?.strategies?.cycleCount || 0
    const realtimeCycleCount = (engHealth as any)?.realtime?.cycleCount || 0

    // Get indication types count
    const directionCount = await query(
      "SELECT COUNT(*) as count FROM indications_direction WHERE connection_id = ?",
      [connectionId]
    ).catch(() => [])
    const moveCount = await query(
      "SELECT COUNT(*) as count FROM indications_move WHERE connection_id = ?",
      [connectionId]
    ).catch(() => [])
    const activeCount = await query(
      "SELECT COUNT(*) as count FROM indications_active WHERE connection_id = ?",
      [connectionId]
    ).catch(() => [])
    const optimalCount = await query(
      "SELECT COUNT(*) as count FROM indications_optimal WHERE connection_id = ?",
      [connectionId]
    ).catch(() => [])

    // Get strategy types count
    const stratBase = await query(
      "SELECT COUNT(*) as count FROM strategies_base WHERE connection_id = ?",
      [connectionId]
    ).catch(() => [])
    const stratMain = await query(
      "SELECT COUNT(*) as count FROM strategies_main WHERE connection_id = ?",
      [connectionId]
    ).catch(() => [])
    const stratReal = await query(
      "SELECT COUNT(*) as count FROM strategies_real WHERE connection_id = ?",
      [connectionId]
    ).catch(() => [])
    const stratDca = await query(
      "SELECT COUNT(*) as count FROM strategies_dca WHERE connection_id = ?",
      [connectionId]
    ).catch(() => [])

    const symbolCount = (progState as any)?.symbolsCount || 1

    return NextResponse.json({
      success: true,
      indications: {
        cycleCount: indicationCycleCount,
        types: {
          direction: directionCount[0]?.count || 0,
          move: moveCount[0]?.count || 0,
          active: activeCount[0]?.count || 0,
          optimal: optimalCount[0]?.count || 0,
        },
        totalRecords: (directionCount[0]?.count || 0) +
                     (moveCount[0]?.count || 0) +
                     (activeCount[0]?.count || 0) +
                     (optimalCount[0]?.count || 0),
      },
      strategies: {
        cycleCount: strategyCycleCount,
        types: {
          base: stratBase[0]?.count || 0,
          main: stratMain[0]?.count || 0,
          real: stratReal[0]?.count || 0,
          dca: stratDca[0]?.count || 0,
        },
        totalRecords: (stratBase[0]?.count || 0) +
                     (stratMain[0]?.count || 0) +
                     (stratReal[0]?.count || 0) +
                     (stratDca[0]?.count || 0),
      },
      realtime: {
        cycleCount: realtimeCycleCount,
      },
      metadata: {
        symbolCount,
        indicationsPerCycle: symbolCount,
      },
    })
  } catch (error) {
    console.error("[v0] Engine stats error:", error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
