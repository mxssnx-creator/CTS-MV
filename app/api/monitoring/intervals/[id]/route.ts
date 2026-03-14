import { NextResponse } from "next/server"
import { globalIntervalManager } from "@/lib/interval-progression-manager"
import { initRedis, getSettings, getRedisClient } from "@/lib/redis-db"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ success: false, error: "Connection ID required" }, { status: 400 })
    }

    await initRedis()

    // Try to get from interval manager first
    let intervals = await globalIntervalManager.getIntervalHealth(id)

    // If empty, try to derive from engine state
    if (!intervals || Object.keys(intervals).length === 0) {
      const engineState = await getSettings(`trade_engine_state:${id}`)
      const isRunning = engineState?.status === "running"
      const lastRun = engineState?.last_indication_run
      
      // Get indication settings for interval times
      const indicationSettings = await getSettings("indication_settings") || {}
      
      // Build intervals from engine state
      intervals = {
        direction: {
          enabled: true,
          isRunning,
          isProgressing: isRunning && lastRun && (Date.now() - new Date(lastRun).getTime()) < 5000,
          intervalTime: indicationSettings.direction?.interval || 1,
          timeout: indicationSettings.direction?.timeout || 5,
          lastStart: lastRun,
          lastEnd: lastRun,
        },
        move: {
          enabled: true,
          isRunning,
          isProgressing: isRunning && lastRun && (Date.now() - new Date(lastRun).getTime()) < 5000,
          intervalTime: indicationSettings.move?.interval || 1,
          timeout: indicationSettings.move?.timeout || 5,
          lastStart: lastRun,
          lastEnd: lastRun,
        },
        active: {
          enabled: true,
          isRunning,
          isProgressing: isRunning && lastRun && (Date.now() - new Date(lastRun).getTime()) < 5000,
          intervalTime: indicationSettings.active?.interval || 1,
          timeout: indicationSettings.active?.timeout || 5,
          lastStart: lastRun,
          lastEnd: lastRun,
        },
        optimal: {
          enabled: true,
          isRunning,
          isProgressing: isRunning && lastRun && (Date.now() - new Date(lastRun).getTime()) < 5000,
          intervalTime: indicationSettings.optimal?.interval || 2,
          timeout: indicationSettings.optimal?.timeout || 10,
          lastStart: lastRun,
          lastEnd: lastRun,
        },
      }
    }

    return NextResponse.json({
      success: true,
      intervals,
    })
  } catch (error) {
    console.error("[v0] Error fetching interval health:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch interval health" },
      { status: 500 }
    )
  }
}
