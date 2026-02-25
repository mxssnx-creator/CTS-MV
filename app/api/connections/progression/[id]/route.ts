import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

/**
 * GET /api/connections/progression/[id]
 * Returns progression in the format the ActiveConnectionCard expects
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await initRedis()

    // Get progression phase data from engine-manager's updateProgressionPhase
    const progression = await getSettings(`engine_progression:${id}`)
    
    // Get engine state and running flag
    const engineState = await getSettings(`trade_engine_state:${id}`)
    const engineRunningRaw = await getSettings(`engine_is_running:${id}`)
    const engineRunning = engineRunningRaw === "true" || engineRunningRaw === true
    
    const phase = progression?.phase || (engineRunning ? "initializing" : "idle")
    const progress = Number(progression?.progress) || 0
    const detail = progression?.detail || ""
    const subItem = progression?.sub_item || ""
    const subCurrent = Number(progression?.sub_current) || 0
    const subTotal = Number(progression?.sub_total) || 0

    // Build message from detail + sub-progress info
    let message = detail
    if (subTotal > 0) {
      message = `${detail} (${subCurrent}/${subTotal})`
    }

    // Derive detailed step flags from phase progression
    const phaseOrder = ["initializing", "prehistoric_data", "indications", "strategies", "realtime", "live_trading"]
    const currentIdx = phaseOrder.indexOf(phase)

    return NextResponse.json({
      success: true,
      progression: {
        phase,
        progress,
        message,
        subPhase: subItem || null,
        startedAt: engineState?.started_at || null,
        updatedAt: progression?.updated_at || engineState?.updated_at || null,
        details: {
          historicalDataLoaded: currentIdx >= 2, // past prehistoric_data
          indicationsCalculated: currentIdx >= 3, // past indications
          strategiesProcessed: currentIdx >= 4,   // past strategies
          liveProcessingActive: currentIdx >= 4,  // realtime or live_trading
          liveTradingActive: phase === "live_trading",
        },
        error: engineState?.error_message || (phase === "error" ? detail : null),
      },
    })
  } catch (error) {
    console.error("[v0] Failed to fetch progression:", error)
    const { id } = await params
    return NextResponse.json({ 
      success: true,
      progression: {
        phase: "error",
        progress: 0,
        message: "Failed to fetch progression status",
        subPhase: null,
        startedAt: null,
        updatedAt: null,
        details: {
          historicalDataLoaded: false,
          indicationsCalculated: false,
          strategiesProcessed: false,
          liveProcessingActive: false,
          liveTradingActive: false,
        },
        error: error instanceof Error ? error.message : "Unknown error",
      },
    }, { status: 500 })
  }
}
