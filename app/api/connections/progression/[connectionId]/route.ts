/**
 * GET /api/connections/progression/[connectionId]
 * Returns real-time engine progression data for a specific connection.
 * Read by active-connection-card.tsx to display phase/progress bar.
 *
 * Data sources (all in Redis via setSettings → settings:key):
 *   - settings:engine_progression:{connectionId}  → written by engine-manager.updateProgressionPhase
 *   - settings:trade_engine_state:{connectionId}  → written by engine-manager.updateEngineState
 *   - settings:engine_is_running:{connectionId}   → written by engine-manager.setRunningFlag
 *   - trade_engine:global                          → hset hash, global coordinator state
 */

import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings, getConnection, getRedisClient } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

interface ProgressionResponse {
  phase: string
  progress: number
  message: string
  subPhase: string | null
  subProgress: { current: number; total: number }
  startedAt: string | null
  updatedAt: string
  details: {
    historicalDataLoaded: boolean
    indicationsCalculated: boolean
    strategiesProcessed: boolean
    liveProcessingActive: boolean
    liveTradingActive: boolean
    cyclesCompleted?: number
    indicationCycles?: number
    strategyCycles?: number
    realtimeCycles?: number
    lastIndicationRun?: string | null
    lastStrategyRun?: string | null
    totalStrategiesEvaluated?: number
    marketDataLoaded?: boolean
    symbolsCount?: number
  }
  error: string | null
}

/** Map engine phase string to human-readable message */
function phaseToMessage(phase: string, detail?: string): string {
  if (detail && detail !== phase) return detail
  const map: Record<string, string> = {
    idle: "Not running",
    stopped: "Engine stopped",
    initializing: "Initializing engine...",
    market_data: "Loading market data...",
    prehistoric_data: "Loading historical data...",
    indications: "Running indication processor...",
    strategies: "Running strategy processor...",
    realtime: "Starting real-time processor...",
    live_trading: "Live trading active",
    error: "Engine error",
    running: "Engine running",
  }
  return map[phase] || phase
}

/** Map phase to % progress floor (engine writes specific values but this is the fallback) */
function phaseToProgressFloor(phase: string): number {
  const map: Record<string, number> = {
    idle: 0,
    stopped: 0,
    error: 0,
    initializing: 5,
    market_data: 8,
    prehistoric_data: 10,
    indications: 60,
    strategies: 75,
    realtime: 85,
    live_trading: 100,
    running: 90,
  }
  return map[phase] ?? 0
}

/** Determine progress/phase from engine state + progression data */
function analyzePhase(
  progressionData: any,
  engineState: any,
  isRunningFlag: boolean,
  isGloballyRunning: boolean,
  isActive: boolean,
  indicationsCount: number,
): { phase: string; progress: number; message: string; phaseIndex: number; running: boolean } {
  const hasProgression = progressionData && typeof progressionData === "object"
  const phase = hasProgression ? (progressionData.phase || "idle") : (engineState?.status || "idle")
  const progress = hasProgression
    ? Number(progressionData.progress ?? phaseToProgressFloor(phase))
    : phaseToProgressFloor(phase)
  const detail = hasProgression ? (progressionData.detail || "") : ""
  const message = phaseToMessage(phase, detail)
  const running = isRunningFlag || phase === "live_trading" || phase === "realtime"
  const phaseIndex = ["idle", "initializing", "market_data", "prehistoric_data", "indications", "strategies", "realtime", "live_trading"].indexOf(phase)
  return { phase, progress, message, phaseIndex, running }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
    console.log(`[v0] [Progression] Fetching progression for: ${connectionId}`)

    await initRedis()
    const client = getRedisClient()

    // ── 1. Read engine_progression key (written by engine-manager.updateProgressionPhase) ──
    const progressionData = await getSettings(`engine_progression:${connectionId}`)
    console.log(`[v0] [Progression] Raw progression data for ${connectionId}:`, progressionData)

    // ── 2. Read trade_engine_state key (written by engine-manager.updateEngineState) ──
    const engineState = await getSettings(`trade_engine_state:${connectionId}`)

    // ── 3. Read running flag ──
    const isRunningRaw = await getSettings(`engine_is_running:${connectionId}`)
    const isRunningFlag = isRunningRaw === "true" || isRunningRaw === true

    // ── 4. Check global coordinator state ──
    let isGloballyRunning = false
    try {
      const globalState = await client.hgetall("trade_engine:global")
      isGloballyRunning = globalState?.status === "running"
    } catch (_e) {
      // Non-fatal
    }

    // ── 5. Get connection name ──
    let connectionName = connectionId
    let isActive = false
    try {
      // Try direct lookup first, then with conn- prefix
      let conn = await getConnection(connectionId)
      if (!conn && !connectionId.startsWith("conn-")) {
        conn = await getConnection(`conn-${connectionId}`)
      }
      if (conn) {
        connectionName = conn.name || connectionId
        isActive = conn.is_enabled_dashboard === "1" || conn.is_enabled === true
      }
    } catch (_e) {
      // Non-fatal
    }

    // ── 6. Count indications ──
    let indicationsCount = 0
    try {
      const connKey = connectionId.startsWith("conn-") ? connectionId : `conn-${connectionId}`
      const indKeys = await client.smembers(`indications:${connKey}`)
      indicationsCount = Array.isArray(indKeys) ? indKeys.length : 0
    } catch (_e) {
      // Non-fatal
    }

    const engineStateLog = {
      running: isRunningFlag,
      isGloballyRunning,
      isActive,
      indicationsCount,
    }
    console.log(`[v0] [Progression] Engine state for ${connectionName}:`, engineStateLog)

    // ── 7. Derive phase, progress, message ──
    const phaseInfo = {
      phase: progressionData?.phase || engineState?.status || "idle",
      progress: Number(progressionData?.progress ?? 0),
      detail: progressionData?.detail || "",
      running: isRunningFlag,
      isActive,
    }
    console.log(`[v0] [Progression] Phase for ${connectionName}:`, phaseInfo)

    const phaseAnalysis = analyzePhase(
      progressionData,
      engineState,
      isRunningFlag,
      isGloballyRunning,
      isActive,
      indicationsCount,
    )
    console.log(`[v0] [Progression] Phase analysis for ${connectionName}:`, phaseAnalysis)

    // ── 8. Build detailed progression details from engine state ──
    const historicalDataLoaded = engineState?.prehistoric_data_loaded === true || engineState?.prehistoric_data_loaded === "true"
    const indicationsCalculated = indicationsCount > 0 || (engineState?.last_indication_run != null)
    const strategiesProcessed = (Number(engineState?.strategy_cycle_count || 0) > 0) || (Number(engineState?.total_strategies_evaluated || 0) > 0)
    const liveProcessingActive = isRunningFlag && phaseAnalysis.phaseIndex >= 6
    const liveTradingActive = phaseAnalysis.phase === "live_trading"

    const details: ProgressionResponse["details"] = {
      historicalDataLoaded,
      indicationsCalculated,
      strategiesProcessed,
      liveProcessingActive,
      liveTradingActive,
      cyclesCompleted: Number(engineState?.indication_cycle_count || 0) + Number(engineState?.strategy_cycle_count || 0),
      indicationCycles: Number(engineState?.indication_cycle_count || 0),
      strategyCycles: Number(engineState?.strategy_cycle_count || 0),
      realtimeCycles: Number(engineState?.realtime_cycle_count || 0),
      lastIndicationRun: engineState?.last_indication_run || null,
      lastStrategyRun: engineState?.last_strategy_run || null,
      totalStrategiesEvaluated: Number(engineState?.total_strategies_evaluated || 0),
      marketDataLoaded: engineState?.market_data_loaded === true || engineState?.market_data_loaded === "true",
      symbolsCount: Number(engineState?.symbols_count || 0),
    }

    // ── 9. Determine subProgress ──
    const subCurrent = Number(progressionData?.sub_current || 0)
    const subTotal = Number(progressionData?.sub_total || 0)

    const response = {
      success: true,
      connectionId,
      connectionName,
      progression: {
        phase: phaseAnalysis.phase,
        progress: phaseAnalysis.progress,
        message: phaseAnalysis.message,
        subPhase: progressionData?.sub_item || null,
        subProgress: { current: subCurrent, total: subTotal },
        startedAt: engineState?.started_at || null,
        updatedAt: progressionData?.updated_at || new Date().toISOString(),
        details,
        error: engineState?.error_message || null,
      },
    }

    console.log(`[v0] [Progression] Response for ${connectionName}:`, JSON.stringify(response, null, 2))

    return NextResponse.json(response)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[v0] [Progression] Error:", errMsg)
    return NextResponse.json(
      { success: false, error: "Failed to fetch progression", details: errMsg },
      { status: 500 }
    )
  }
}
