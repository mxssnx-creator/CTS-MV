import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getRedisClient, getSettings, getConnection } from "@/lib/redis-db"
import { getProgressionLogs } from "@/lib/engine-progression-logs"

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

    await initRedis()

    // Get connection details for context
    const connection = await getConnection(connectionId)
    const connName = connection?.name || connectionId

    // Get progression phase data from engine-manager's updateProgressionPhase
    const progression = await getSettings(`engine_progression:${connectionId}`)
    
    // Get engine state from the correct Redis key: trade_engine:global
    const client = getRedisClient()
    let globalState: any = {}
    try {
      const globalStateStr = await client.get("trade_engine:global")
      globalState = globalStateStr ? JSON.parse(globalStateStr) : {}
    } catch {
      globalState = {}
    }
    const isGloballyRunning = globalState?.status === "running"
    
    // Check if this connection is currently active/dashboard enabled
    const isActive = connection?.is_enabled_dashboard === "1" || connection?.is_enabled_dashboard === true
    const isEnabled = connection?.is_enabled === "1" || connection?.is_enabled === true
    const isInserted = connection?.is_inserted === "1" || connection?.is_inserted === true
    
    // Count indications processed for this connection
    let indicationsCount = 0
    let strategiesCount = 0
    if (client && isActive) {
      try {
        // Check indication keys
        const keys = await client.keys(`indication:${connectionId}:*`)
        indicationsCount = keys.length
        
        // Check strategy keys
        const stratKeys = await client.keys(`strategy:${connectionId}:*`)
        strategiesCount = stratKeys.length
      } catch (e) {
        indicationsCount = 0
        strategiesCount = 0
      }
    }
    
    // Engine is running if: global engine is running AND this connection is active
    const engineRunning = isGloballyRunning && isActive && isEnabled && isInserted
    
    // Phase progression depends on stored phase or derived from state
    let phase = progression?.phase || "idle"
    let progress = Number(progression?.progress) || 0
    let detail = progression?.detail || "Not running"
    
    // Override phase based on actual connection state if no stored progression
    if (!progression && isActive && isEnabled && isInserted) {
      phase = "initializing"
      progress = 10
      detail = "Connection enabled - waiting for engine cycle..."
    } else if (!isActive && !isEnabled) {
      phase = "idle"
      progress = 0
      detail = "Connection disabled"
    } else if (engineRunning && phase !== "error") {
      // Engine is running and connection is active - show realtime progression
      if (indicationsCount > 0) {
        phase = "realtime"
        progress = 85
        detail = `Processing ${indicationsCount} indications, ${strategiesCount} strategies`
      }
    }
    
    // Get recent logs for context
    const recentLogs = await getProgressionLogs(connectionId)
    const lastLog = recentLogs[0] || null
    
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
      connection: {
        exchange: connection?.exchange || "unknown",
        isActive,
        isEnabled,
        isInserted,
      },
      progression: {
        phase,
        progress,
        message,
        subPhase: subItem || null,
        subProgress: {
          current: subCurrent,
          total: subTotal,
        },
        startedAt: globalState?.started_at || null,
        updatedAt: progression?.updated_at || new Date().toISOString(),
        details: {
          historicalDataLoaded: currentIdx >= 3,
          indicationsCalculated: currentIdx >= 4 || engineRunning,
          strategiesProcessed: currentIdx >= 5 || engineRunning,
          liveProcessingActive: currentIdx >= 5 || engineRunning,
          liveTradingActive: phase === "live_trading",
        },
        error: phase === "error" ? detail : null,
      },
      metrics: {
        indicationsCount,
        strategiesCount,
        engineRunning,
        globalEngineStatus: globalState?.status || "unknown",
      },
      recentLogs: recentLogs.slice(0, 10).map(log => ({
        timestamp: log.timestamp,
        level: log.level,
        phase: log.phase,
        message: log.message,
      })),
    }

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
