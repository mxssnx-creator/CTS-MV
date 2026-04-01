import { type NextRequest, NextResponse } from "next/server"
import { getProgressionLogs, clearProgressionLogs } from "@/lib/engine-progression-logs"
import { initRedis, getRedisClient, getSettings } from "@/lib/redis-db"
import { ProgressionStateManager } from "@/lib/progression-state-manager"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    
    await initRedis()

    if (!connectionId) {
      return NextResponse.json({ error: "Connection ID required" }, { status: 400 })
    }

    // Get progression logs for this connection
    const logs = await getProgressionLogs(connectionId)
    
    // Get progression state (cycles, trades, etc.)
    const progressionState = await ProgressionStateManager.getProgressionState(connectionId)
    
    // Get engine progression phase
    const engineProgression = await getSettings(`engine_progression:${connectionId}`)
    
    // Get structured engine logs
    const client = getRedisClient()
    let structuredLogs: any[] = []
    try {
      const rawLogs = await client.lrange(`engine:logs:${connectionId}`, 0, 100)
      structuredLogs = rawLogs.map((log: string) => {
        try { return JSON.parse(log) } catch { return null }
      }).filter(Boolean)
    } catch {
      structuredLogs = []
    }

    return NextResponse.json({
      success: true,
      connectionId,
      logsCount: logs.length,
      logs,
      structuredLogs,
      structuredLogsCount: structuredLogs.length,
      progressionState: {
        cyclesCompleted: progressionState.cyclesCompleted,
        successfulCycles: progressionState.successfulCycles,
        failedCycles: progressionState.failedCycles,
        totalTrades: progressionState.totalTrades,
        successfulTrades: progressionState.successfulTrades,
        totalProfit: progressionState.totalProfit,
        cycleSuccessRate: progressionState.cycleSuccessRate,
        tradeSuccessRate: progressionState.tradeSuccessRate,
        lastCycleTime: progressionState.lastCycleTime,
        prehistoricCyclesCompleted: progressionState.prehistoricCyclesCompleted,
        prehistoricPhaseActive: progressionState.prehistoricPhaseActive,
      },
      enginePhase: engineProgression ? {
        phase: engineProgression.phase,
        progress: engineProgression.progress,
        detail: engineProgression.detail,
        updatedAt: engineProgression.updated_at,
      } : null,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error fetching progression logs:", error)
    return NextResponse.json(
      { error: "Failed to fetch progression logs", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    
    await initRedis()

    if (!connectionId) {
      return NextResponse.json({ error: "Connection ID required" }, { status: 400 })
    }

    // Clear progression logs
    await clearProgressionLogs(connectionId)
    
    // Also clear structured logs
    const client = getRedisClient()
    await client.del(`engine:logs:${connectionId}`)
    await client.del(`engine_logs:${connectionId}`)

    return NextResponse.json({
      success: true,
      message: "Logs cleared successfully",
      connectionId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error clearing progression logs:", error)
    return NextResponse.json(
      { error: "Failed to clear logs", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
