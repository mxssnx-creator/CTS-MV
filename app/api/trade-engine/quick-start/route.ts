import { NextResponse } from "next/server"
import { getAllConnections, initRedis, updateConnection } from "@/lib/redis-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/trade-engine/quick-start
 * Quick-start endpoint: enables first available bybit/bingx connection on dashboard
 * Useful for testing when no connections are actively enabled
 */
export async function POST() {
  try {
    console.log("[v0] [QuickStart] Attempting to enable first available dashboard connection...")
    
    await initRedis()
    const allConnections = await getAllConnections()
    
    // Find first bybit or bingx connection (dashboard-inserted)
    const bybitBingx = allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      const isDashboardInserted = c.is_dashboard_inserted === "1" || c.is_dashboard_inserted === true
      return (exch === "bybit" || exch === "bingx") && isDashboardInserted
    })
    
    if (!bybitBingx) {
      return NextResponse.json(
        { 
          error: "No bybit/bingx connections found on dashboard",
          message: "Add a bybit or bingx connection from Settings first"
        },
        { status: 404 }
      )
    }
    
    // Enable it
    const updated = {
      ...bybitBingx,
      is_enabled_dashboard: "1",
      updated_at: new Date().toISOString(),
    }
    
    await updateConnection(bybitBingx.id, updated)
    
    console.log(`[v0] [QuickStart] ✓ Enabled ${bybitBingx.name} (${bybitBingx.exchange})`)
    
    return NextResponse.json({
      success: true,
      message: `Enabled ${bybitBingx.name}. Trade engine should start automatically.`,
      connection: {
        id: bybitBingx.id,
        name: bybitBingx.name,
        exchange: bybitBingx.exchange,
        is_enabled_dashboard: "1",
      },
    })
  } catch (error) {
    console.error("[v0] [QuickStart] Error:", error)
    return NextResponse.json(
      { error: "Quick start failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
