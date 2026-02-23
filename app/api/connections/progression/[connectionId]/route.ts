import { NextResponse } from "next/server"
import { initRedis, getSettings, getConnection } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

/**
 * GET /api/connections/progression/[connectionId]
 * Returns engine progression state for a specific connection.
 * Data is written by TradeEngineManager.updateProgressionPhase() 
 * to Redis key: settings:engine_progression:{connectionId}
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
    await initRedis()

    // Read engine progression from Redis
    const progression = await getSettings(`engine_progression:${connectionId}`)
    
    // Read engine running flag
    const isRunningRaw = await getSettings(`engine_is_running:${connectionId}`)
    const engineRunning = isRunningRaw === "true" || isRunningRaw === true
    
    // Read engine state
    const engineState = await getSettings(`trade_engine_state:${connectionId}`)
    const engineStatus = engineState?.status || "idle"

    // Read connection to check active state (stored as is_enabled_dashboard in Redis)
    const connection = await getConnection(connectionId)
    const isActive = connection?.is_enabled_dashboard === "1" || connection?.is_enabled_dashboard === true

    if (!progression || !isActive) {
      // No progression data or connection not active - return idle state
      return NextResponse.json({
        phase: "idle",
        progress: 0,
        detail: "",
        sub_current: 0,
        sub_total: 0,
        sub_item: "",
        engine_status: isActive ? engineStatus : "disabled",
        engine_running: false,
        connection_id: connectionId,
        updated_at: null,
      })
    }

    return NextResponse.json({
      phase: progression.phase || "idle",
      progress: progression.progress || 0,
      detail: progression.detail || "",
      sub_current: progression.sub_current || 0,
      sub_total: progression.sub_total || 0,
      sub_item: progression.sub_item || "",
      engine_status: engineStatus,
      engine_running: engineRunning,
      connection_id: connectionId,
      updated_at: progression.updated_at || null,
    })
  } catch (error) {
    console.error("[v0] [Progression] Error:", error)
    return NextResponse.json({
      phase: "error",
      progress: 0,
      detail: error instanceof Error ? error.message : "Unknown error",
      sub_current: 0,
      sub_total: 0,
      sub_item: "",
      engine_status: "error",
      engine_running: false,
      connection_id: "",
      updated_at: null,
    })
  }
}
