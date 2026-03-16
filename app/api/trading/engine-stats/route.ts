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

    console.log(`[v0] [EngineStats] ${connectionId}: engState indication_cycle_count=${(engState as any)?.indication_cycle_count}, strategy_cycle_count=${(engState as any)?.strategy_cycle_count}`)
    console.log(`[v0] [EngineStats] ${connectionId}: Full engState=`, engState)

    let indicationCycleCount = (engState as any)?.indication_cycle_count || (engHealth as any)?.indications?.cycleCount || 0
    let strategyCycleCount = (engState as any)?.strategy_cycle_count || (engHealth as any)?.strategies?.cycleCount || 0
    const realtimeCycleCount = (engHealth as any)?.realtime?.cycleCount || 0

    // Fallback: if cycle counts are 0, try to count from database
    if (!indicationCycleCount) {
      try {
        const countResult = await query(
          "SELECT COUNT(*) as count FROM indications WHERE connection_id = ? AND calculated_at > datetime('now', '-1 hour')",
          [connectionId]
        ).catch(() => [])
        indicationCycleCount = Math.max(indicationCycleCount, countResult[0]?.count || 0)
      } catch (e) {
        // Ignore DB errors
      }
    }

    if (!strategyCycleCount) {
      try {
        const countResult = await query(
          "SELECT COUNT(*) as count FROM strategies_real WHERE connection_id = ? AND evaluated_at > datetime('now', '-1 hour')",
          [connectionId]
        ).catch(() => [])
        strategyCycleCount = Math.max(strategyCycleCount, countResult[0]?.count || 0)
      } catch (e) {
        // Ignore DB errors
      }
    }

    console.log(`[v0] [EngineStats] ${connectionId}: FINAL cycleCount - indication=${indicationCycleCount}, strategy=${strategyCycleCount}`)

    // Get indication types count (from the generic indications table with type field)
    const indicationStats = await query(
      `SELECT type, COUNT(*) as count FROM indications WHERE connection_id = ? AND calculated_at > datetime('now', '-24 hours') GROUP BY type`,
      [connectionId]
    ).catch(() => [])
    
    const indicationsByType: Record<string, number> = {
      base: 0,
      main: 0,
      real: 0,
      live: 0,
    }
    
    for (const row of indicationStats as any[]) {
      indicationsByType[row.type] = row.count
    }

    // Get strategy types count (from strategies_real with type field)
    const strategyStats = await query(
      `SELECT type, COUNT(*) as count FROM strategies_real WHERE connection_id = ? AND evaluated_at > datetime('now', '-24 hours') GROUP BY type`,
      [connectionId]
    ).catch(() => [])
    
    const strategiesByType: Record<string, number> = {
      base: 0,
      main: 0,
      real: 0,
      live: 0,
    }
    
    for (const row of strategyStats as any[]) {
      strategiesByType[row.type] = row.count
    }

    const symbolCount = (progState as any)?.symbolsCount || 1

    return NextResponse.json({
      success: true,
      indications: {
        cycleCount: indicationCycleCount,
        types: indicationsByType,
        evaluated: indicationCycleCount,
        base: indicationsByType.base,
        main: indicationsByType.main,
        real: indicationsByType.real,
        live: indicationsByType.live,
        totalRecords: Object.values(indicationsByType).reduce((a, b) => a + b, 0),
      },
      strategies: {
        cycleCount: strategyCycleCount,
        types: strategiesByType,
        base: strategiesByType.base,
        main: strategiesByType.main,
        real: strategiesByType.real,
        live: strategiesByType.live,
        drawdown_max: 0, // TODO: Calculate from database
        drawdown_time_hours: 0, // TODO: Calculate from database
        totalRecords: Object.values(strategiesByType).reduce((a, b) => a + b, 0),
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
