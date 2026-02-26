import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getSettings } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

/**
 * GET /api/trade-engine/progression
 * Returns progression data for ALL active connections.
 * Individual connection progression: /api/connections/progression/[id]
 */
export async function GET() {
  try {
    await initRedis()
    const allConnections = await getAllConnections()

    // Only include connections that are active on dashboard
    const activeConnections = allConnections.filter((c: any) => {
      const d = c.is_enabled_dashboard
      return d === true || d === "1" || d === "true"
    })

    const progressionData = await Promise.all(
      activeConnections.map(async (conn: any) => {
        const progression = await getSettings(`engine_progression:${conn.id}`)
        const engineRunningRaw = await getSettings(`engine_is_running:${conn.id}`)
        const engineRunning = engineRunningRaw === "true" || engineRunningRaw === true

        const phase = progression?.phase || (engineRunning ? "initializing" : "idle")
        const progress = Number(progression?.progress) || 0

        return {
          connectionId: conn.id,
          connectionName: conn.name,
          exchange: conn.exchange,
          isEnabled: conn.is_enabled === true || conn.is_enabled === "1",
          isLiveTrading: conn.is_live_trade === true || conn.is_live_trade === "1",
          isPresetTrading: conn.is_preset_trade === true || conn.is_preset_trade === "1",
          isEngineRunning: engineRunning,
          phase,
          progress,
          detail: progression?.detail || "",
          subItem: progression?.sub_item || "",
          subCurrent: Number(progression?.sub_current) || 0,
          subTotal: Number(progression?.sub_total) || 0,
          updatedAt: progression?.updated_at || null,
        }
      })
    )

    return NextResponse.json({
      success: true,
      connections: progressionData,
      totalConnections: progressionData.length,
      runningEngines: progressionData.filter(c => c.isEngineRunning).length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Failed to fetch progression:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to fetch progression",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
