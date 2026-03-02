import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getRedisClient, getSettings, getConnection } from "@/lib/redis-db"

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
    
    // Get engine state from the correct Redis key: trade_engine:global
    const client = getRedisClient()
    const engineHash = client ? await client.hgetall("trade_engine:global") : null
    const isGloballyRunning = engineHash?.status === "running"
    
    // Check if this connection is currently active/dashboard enabled
    const isActive = connection?.is_enabled_dashboard === "1" || connection?.is_enabled_dashboard === true
    
    // Count indications processed for this connection
    let indicationsCount = 0
    if (client && isActive) {
      try {
        indicationsCount = await client.scard(`indications:${connectionId}`)
      } catch (e) {
        indicationsCount = 0
      }
    }
    
    // Engine is running if: global engine is running AND this connection is active
    const engineRunning = isGloballyRunning && isActive
    
    console.log(`[v0] [Progression] Engine state for ${connName}:`, {
      running: engineRunning,
      isGloballyRunning,
      isActive,
      indicationsCount,
    })
    
    // Phase progression depends on what stage the connection is at
    let phase = "idle"
    let progress = 0
    let detail = "Not running"
    
    if (engineRunning && isActive) {
      // Engine is running and connection is active - show realtime progression
      phase = "realtime"
      progress = 85
      detail = "Processing realtime indications and strategies"
      
      // Check prehistoric data if we have it
      const prehistoricKey = `prehistoric:${connectionId}:data`
      const prehistoricCount = client ? await client.hlen(prehistoricKey).catch(() => 0) : 0
      
      if (prehistoricCount > 0) {
        // Historical data already loaded, show progress
        progress = 90
        detail = `${prehistoricCount} historical candles loaded - processing realtime...`
      }
    }
    
    console.log(`[v0] [Progression] Phase for ${connName}:`, {
      phase,
      progress,
      detail,
      running: engineRunning,
      isActive,
    })
    
    const subItem = progression?.sub_item || ""
    const subCurrent = Number(progression?.sub_current) || 0
    const subTotal = Number(progression?.sub_total) || 0

    // Build comprehensive message from detail + sub-progress info
    let message = detail
    if (subTotal > 0 && subCurrent > 0) {
      message = `${detail} (${subCurrent}/${subTotal}${subItem ? ` - ${subItem}` : ""})`
    } else if (engineRunning && phase === "realtime") {
      message = "Processing realtime indications and strategies"
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
        updatedAt: progression?.updated_at || engineState?.updated_at || new Date().toISOString(),
        details: {
          historicalDataLoaded: currentIdx >= 3, // past prehistoric_data
          indicationsCalculated: currentIdx >= 4 || engineRunning, // past indications or engine running
          strategiesProcessed: currentIdx >= 5 || engineRunning,   // past strategies or engine running
          liveProcessingActive: currentIdx >= 5 || engineRunning,  // realtime or live_trading or engine running
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
