import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings, getConnection } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

/**
 * GET /api/connections/progression/[id]
 * Returns comprehensive progression data for an active connection
 * Tracks: initialization, historical data loading, indications, strategies, realtime, live trading
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    
    console.log(`[v0] [Progression] Fetching progression for: ${connectionId}`)

    await initRedis()

    // Get connection details for context
    const connection = await getConnection(connectionId)
    const connName = connection?.name || connectionId

    // Get progression phase data from engine-manager's updateProgressionPhase
    const progression = await getSettings(`engine_progression:${connectionId}`)
    console.log(`[v0] [Progression] Raw progression data for ${connName}:`, progression)
    
    // Get engine state and running flag
    const engineState = await getSettings(`trade_engine_state:${connectionId}`)
    const engineRunningRaw = await getSettings(`engine_is_running:${connectionId}`)
    const engineRunning = engineRunningRaw === "true" || engineRunningRaw === true
    
    console.log(`[v0] [Progression] Engine state for ${connName}:`, {
      running: engineRunning,
      state: engineState,
    })
    
    const phase = progression?.phase || (engineRunning ? "initializing" : "idle")
    const progress = Number(progression?.progress) || 0
    const detail = progression?.detail || (engineRunning ? "Starting up..." : "Not running")
    const subItem = progression?.sub_item || ""
    const subCurrent = Number(progression?.sub_current) || 0
    const subTotal = Number(progression?.sub_total) || 0

    // Build comprehensive message from detail + sub-progress info
    let message = detail
    if (subTotal > 0 && subCurrent > 0) {
      message = `${detail} (${subCurrent}/${subTotal}${subItem ? ` - ${subItem}` : ""})`
    }

    // Derive detailed step flags from phase progression
    const phaseOrder = ["idle", "initializing", "prehistoric_data", "indications", "strategies", "realtime", "live_trading"]
    const currentIdx = phaseOrder.indexOf(phase)

    console.log(`[v0] [Progression] Phase analysis for ${connName}:`, {
      phase,
      progress,
      message,
      phaseIndex: currentIdx,
      running: engineRunning,
    })

    const response = {
      success: true,
      connectionId,
      connectionName: connName,
      progression: {
        phase,
        progress,
        message,
        subPhase: subItem || null,
        subProgress: {
          current: subCurrent,
          total: subTotal,
        },
        startedAt: engineState?.started_at || null,
        updatedAt: progression?.updated_at || engineState?.updated_at || null,
        details: {
          historicalDataLoaded: currentIdx >= 3, // past prehistoric_data
          indicationsCalculated: currentIdx >= 4, // past indications
          strategiesProcessed: currentIdx >= 5,   // past strategies
          liveProcessingActive: currentIdx >= 5,  // realtime or live_trading
          liveTradingActive: phase === "live_trading",
        },
        error: engineState?.error_message || (phase === "error" ? detail : null),
      },
    }

    console.log(`[v0] [Progression] Response for ${connName}:`, response)
    return NextResponse.json(response)
  } catch (error) {
    console.error("[v0] [Progression] Failed to fetch progression:", error)
    const { id } = await params
    return NextResponse.json({ 
      success: false,
      progression: {
        phase: "error",
        progress: 0,
        message: "Failed to fetch progression status",
        subPhase: null,
        subProgress: { current: 0, total: 0 },
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
