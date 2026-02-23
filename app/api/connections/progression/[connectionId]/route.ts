import { NextResponse } from "next/server"
import { initRedis, getConnection, getSettings, getRedisClient } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
    await initRedis()
    const client = getRedisClient()

    // Read connection to check active state (stored as is_enabled_dashboard in Redis)
    const connection = await getConnection(connectionId)
    const isActive = connection?.is_enabled_dashboard === "1" || connection?.is_enabled_dashboard === true

    // Read progression state from Redis hash
    const progressionKey = `engine_progression:${connectionId}`
    const progressionData = await client.hgetall(progressionKey) || {}

    // Also check settings-based progression data
    const settingsProgression = await getSettings(`engine_progression:${connectionId}`)

    const merged = { ...settingsProgression, ...progressionData }

    return NextResponse.json({
      success: true,
      connectionId,
      isActive,
      progression: {
        phase: merged.phase || (isActive ? "idle" : "disabled"),
        progress: parseInt(merged.progress as string) || 0,
        message: merged.message || (isActive ? "Waiting to start..." : "Connection not active"),
        subPhase: merged.sub_phase || null,
        startedAt: merged.started_at || null,
        updatedAt: merged.updated_at || null,
        details: {
          historicalDataLoaded: merged.historical_data_loaded === "1" || merged.historical_data_loaded === true,
          indicationsCalculated: merged.indications_calculated === "1" || merged.indications_calculated === true,
          strategiesProcessed: merged.strategies_processed === "1" || merged.strategies_processed === true,
          liveProcessingActive: merged.live_processing_active === "1" || merged.live_processing_active === true,
          liveTradingActive: merged.live_trading_active === "1" || merged.live_trading_active === true,
        },
        error: merged.error || null,
      },
    })
  } catch (error) {
    console.error("[v0] Progression fetch error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch progression" },
      { status: 500 }
    )
  }
}
