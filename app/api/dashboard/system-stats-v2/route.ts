import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient } from "@/lib/redis-db"
import { filterBaseConnections, filterEnabledBaseConnections, filterDashboardActiveConnections } from "@/lib/connection-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

// REBUILT 2026-02-20 v6 - Uses connection-utils for reliable filtering
export async function GET() {
  console.log("[v0] [System Stats v6] === ENDPOINT CALLED ===")
  
  try {
    await initRedis()
    const client = getRedisClient()
    
    // Get ALL connections from Redis
    const allConnections = await getAllConnections()
    console.log(`[v0] [System Stats v6] Total connections in Redis: ${allConnections.length}`)
    
    // BASE connections = 4 primary exchanges (bybit, bingx, pionex, orangex)
    const baseConnections = filterBaseConnections(allConnections)
    const enabledBase = filterEnabledBaseConnections(allConnections)
    const workingConnections = baseConnections.filter((c: any) => c.last_test_status === "success")
    
    // ACTIVE connections = dashboard-enabled (for trade engine)
    const activeConnections = filterDashboardActiveConnections(allConnections)
    
    const totalBaseConnections = baseConnections.length
    const enabledBaseConnections = enabledBase.length
    const workingBaseConnections = workingConnections.length
    
    console.log(`[v0] [System Stats v6] Base: ${totalBaseConnections}, Enabled: ${enabledBaseConnections}, Working: ${workingBaseConnections}, Active(Dashboard): ${activeConnections.length}`)
    
    // Active Connections (Dashboard enabled connections)
    const totalActiveConnections = activeConnections.length
    const enabledActiveConnections = activeConnections.filter((c: any) => 
      c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1"
    ).length
    
    // Live vs Preset from active connections
    let liveTradeCount = 0
    let presetTradeCount = 0
    
    for (const conn of activeConnections) {
      const liveEnabled = conn.live_trade_enabled === true || conn.live_trade_enabled === "1"
      const presetEnabled = conn.preset_trade_enabled === true || conn.preset_trade_enabled === "1"
      
      if (liveEnabled) liveTradeCount++
      if (presetEnabled) presetTradeCount++
    }
    
    console.log(`[v0] [System Stats] Active Connections - Total: ${totalActiveConnections}, Live: ${liveTradeCount}, Preset: ${presetTradeCount}`)
    
    // Trade Engine Status (read from Redis HASH - start endpoint uses hset)
    const engineStatus = await client.hgetall("trade_engine:global") || {}
    
    const globalStatus = engineStatus.status || "stopped"
    const mainStatus = engineStatus.mainStatus || "stopped"
    const presetStatus = engineStatus.presetStatus || "stopped"
    
    console.log(`[v0] [System Stats] Trade Engine - Global: ${globalStatus}, Main: ${mainStatus}, Preset: ${presetStatus}`)
    
    // Exchange Connection Status
    const exchangeStatus = 
      totalBaseConnections === 0 ? "down" :
      workingBaseConnections === 0 ? "partial" :
      workingBaseConnections < totalBaseConnections / 2 ? "partial" :
      "healthy"
    
    // Database status (always healthy if we got here)
    const dbStatus = "healthy"
    
    // Live trades in last hour - TODO: implement proper trade tracking
    const liveTrades: any[] = []
    
    console.log(`[v0] [System Stats] Live trades in last hour: ${liveTrades.length} (not implemented yet)`)
    
    const response = {
      success: true,
      tradeEngines: {
        globalStatus,
        mainStatus,
        presetStatus,
        totalEnabled: liveTradeCount + presetTradeCount,
      },
      database: {
        status: dbStatus,
        requestsPerSecond: 0,
      },
      exchangeConnections: {
        total: totalBaseConnections,
        enabled: enabledBaseConnections,
        working: workingBaseConnections,
        status: exchangeStatus,
      },
      activeConnections: {
        total: totalActiveConnections,
        enabled: enabledActiveConnections,
        liveTrade: liveTradeCount,
        presetTrade: presetTradeCount,
      },
      liveTrades: {
        lastHour: liveTrades.length,
        topConnections: [],
      },
    }
    
    console.log("[v0] [System Stats] Response prepared successfully")
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error("[v0] [System Stats] ERROR:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch system stats" 
      },
      { status: 500 }
    )
  }
}
