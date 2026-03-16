import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
    
    await initRedis()

    // Get engine state for interval health
    const engineState = await getSettings(`trade_engine_state:${connectionId}`)
    const engineHealth = await getSettings(`trade_engine_health:${connectionId}`)
    const progressionState = await getSettings(`progression_state:${connectionId}`)
    
    // Determine interval status based on actual engine activity
    const isEngineRunning = engineState?.status === "running"
    const lastIndicationRun = engineState?.last_indication_run 
      ? new Date(engineState.last_indication_run)
      : null
    const lastStrategyRun = engineState?.last_strategy_run
      ? new Date(engineState.last_strategy_run)
      : null
    
    // Check if engine has run recently (within 30 seconds)
    const now = Date.now()
    const indicationRecent = lastIndicationRun && (now - lastIndicationRun.getTime()) < 30000
    const strategyRecent = lastStrategyRun && (now - lastStrategyRun.getTime()) < 30000

    // Build interval health data based on actual engine metrics
    const intervals = {
      direction: {
        enabled: true,
        isRunning: isEngineRunning && indicationRecent,
        isProgressing: indicationRecent,
        intervalTime: 1,
        timeout: 5,
        lastStart: lastIndicationRun?.toISOString(),
        lastEnd: lastIndicationRun?.toISOString(),
      },
      move: {
        enabled: true,
        isRunning: isEngineRunning && indicationRecent,
        isProgressing: indicationRecent,
        intervalTime: 1,
        timeout: 5,
        lastStart: lastIndicationRun?.toISOString(),
        lastEnd: lastIndicationRun?.toISOString(),
      },
      active: {
        enabled: true,
        isRunning: isEngineRunning && indicationRecent,
        isProgressing: indicationRecent,
        intervalTime: 1,
        timeout: 5,
        lastStart: lastIndicationRun?.toISOString(),
        lastEnd: lastIndicationRun?.toISOString(),
      },
      optimal: {
        enabled: true,
        isRunning: isEngineRunning && strategyRecent,
        isProgressing: strategyRecent,
        intervalTime: 2,
        timeout: 10,
        lastStart: lastStrategyRun?.toISOString(),
        lastEnd: lastStrategyRun?.toISOString(),
      },
    }

    return NextResponse.json({
      success: true,
      connectionId,
      intervals,
      engineState: {
        status: engineState?.status || "unknown",
        indicationCycleCount: engineState?.indication_cycle_count || 0,
        strategyCycleCount: engineState?.strategy_cycle_count || 0,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error fetching interval health:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to fetch interval health",
        intervals: {
          direction: { enabled: false, isRunning: false, isProgressing: false, intervalTime: 1, timeout: 5 },
          move: { enabled: false, isRunning: false, isProgressing: false, intervalTime: 1, timeout: 5 },
          active: { enabled: false, isRunning: false, isProgressing: false, intervalTime: 1, timeout: 5 },
          optimal: { enabled: false, isRunning: false, isProgressing: false, intervalTime: 2, timeout: 10 },
        }
      },
      { status: 200 } // Return 200 with empty data instead of 500
    )
  }
}
