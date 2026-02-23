import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

/**
 * GET /api/connections/progression/[id]
 * Get real-time progression status for a connection engine
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await initRedis()

    // Get progression phase data
    const progression = await getSettings(`engine_progression:${id}`)
    
    // Get engine state
    const engineState = await getSettings(`trade_engine_state:${id}`)
    const engineRunning = await getSettings(`engine_is_running:${id}`)
    
    if (!progression) {
      return NextResponse.json({
        connectionId: id,
        phase: "idle",
        progress: 0,
        detail: "Not started",
        sub_current: 0,
        sub_total: 0,
        sub_item: "",
        engine_status: engineState?.status || "stopped",
        engine_running: engineRunning === "true" || engineRunning === true,
      })
    }

    return NextResponse.json({
      connectionId: id,
      phase: progression.phase || "idle",
      progress: progression.progress || 0,
      detail: progression.detail || "",
      sub_current: progression.sub_current || 0,
      sub_total: progression.sub_total || 0,
      sub_item: progression.sub_item || "",
      engine_status: engineState?.status || "stopped",
      engine_running: engineRunning === "true" || engineRunning === true,
      updated_at: progression.updated_at,
    })
  } catch (error) {
    console.error("[v0] Failed to fetch progression:", error)
    return NextResponse.json({ 
      connectionId: (await params).id,
      phase: "error", 
      progress: 0, 
      detail: "Failed to fetch progression status" 
    }, { status: 500 })
  }
}
