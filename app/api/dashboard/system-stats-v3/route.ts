import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient, getRedisRequestsPerSecond } from "@/lib/redis-db"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const BASE_EXCHANGES = ["bybit", "bingx", "pionex", "orangex"]

function isBaseExchange(c: any): boolean {
  return BASE_EXCHANGES.includes((c?.exchange || "").toLowerCase().trim())
}

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    
    const allConnections = await getAllConnections()
    
    // BASE = 4 primary exchanges
    const baseConnections = allConnections.filter(isBaseExchange)
    const enabledBase = baseConnections.filter((c: any) => {
      const e = c.is_enabled
      return e === true || e === "1" || e === "true" || e === undefined || e === null
    })
    const workingBase = baseConnections.filter((c: any) => c.last_test_status === "success")
    
    // ACTIVE = connections with is_enabled_dashboard = "1" (independent state)
    const activeConnections = allConnections.filter((c: any) => {
      const d = c.is_enabled_dashboard
      return d === true || d === "1" || d === "true"
    })
    
    // Live vs Preset counts from active connections
    let liveTradeCount = 0
    let presetTradeCount = 0
    for (const conn of activeConnections) {
      if (conn.live_trade_enabled === true || conn.live_trade_enabled === "1" || conn.is_live_trade === true || conn.is_live_trade === "1") liveTradeCount++
      if (conn.preset_trade_enabled === true || conn.preset_trade_enabled === "1" || conn.is_preset_trade === true || conn.is_preset_trade === "1") presetTradeCount++
    }
    
    // Trade Engine Status from Redis
    const engineHash = await client.hgetall("trade_engine:global") || {}
    const globalStatus = engineHash.status || "stopped"
    const mainStatus = globalStatus === "running" && liveTradeCount > 0 ? "running" : liveTradeCount > 0 ? "ready" : "stopped"
    const presetStatus = globalStatus === "running" && presetTradeCount > 0 ? "running" : presetTradeCount > 0 ? "ready" : "stopped"
    
    const exchangeStatus = 
      baseConnections.length === 0 ? "down" :
      workingBase.length === 0 ? "partial" :
      workingBase.length < baseConnections.length / 2 ? "partial" : "healthy"
    
    return NextResponse.json({
      success: true,
      tradeEngines: {
        globalStatus,
        mainStatus,
        mainCount: liveTradeCount,
        mainTotal: activeConnections.length,
        presetStatus,
        presetCount: presetTradeCount,
        presetTotal: activeConnections.length,
        totalEnabled: liveTradeCount + presetTradeCount,
      },
      database: {
        status: "healthy",
        requestsPerSecond: getRedisRequestsPerSecond(),
      },
      exchangeConnections: {
        total: baseConnections.length,
        enabled: enabledBase.length,
        working: workingBase.length,
        status: exchangeStatus,
      },
      activeConnections: {
        total: baseConnections.length,
        active: activeConnections.length,
        liveTrade: liveTradeCount,
        presetTrade: presetTradeCount,
      },
      liveTrades: {
        lastHour: 0,
        topConnections: [],
      },
    })
  } catch (error) {
    console.error("[v0] [System Stats v3] ERROR:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch system stats" },
      { status: 500 }
    )
  }
}
