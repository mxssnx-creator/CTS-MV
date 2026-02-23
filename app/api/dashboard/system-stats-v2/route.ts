import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient, getRedisRequestsPerSecond } from "@/lib/redis-db"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

// Inline base exchange list to avoid import caching issues
const BASE_EXCHANGE_LIST = ["bybit", "bingx", "pionex", "orangex"]

function isBase(c: any): boolean {
  return BASE_EXCHANGE_LIST.includes((c?.exchange || "").toLowerCase().trim())
}

// v7 - All logic inlined, no external imports except redis-db
export async function GET() {
  console.log("[v0] [SysStats-v7] === START ===")
  
  try {
    await initRedis()
    const client = getRedisClient()
    
    const allConnections = await getAllConnections()
    console.log(`[v0] [SysStats-v7] allConnections: ${allConnections.length}`)
    
    // BASE = 4 primary exchanges by exchange name match
    const baseConnections = allConnections.filter(isBase)
    const enabledBase = baseConnections.filter((c: any) => {
      const e = c.is_enabled
      return e === true || e === "1" || e === "true" || e === undefined || e === null
    })
    const workingConnections = baseConnections.filter((c: any) => c.last_test_status === "success")
    
    // ACTIVE = connections with is_enabled_dashboard = "1" (independent state)
    const activeEnabledConnections = allConnections.filter((c: any) => {
      const d = c.is_enabled_dashboard
      return d === true || d === "1" || d === "true"
    })
    
    const totalBaseConnections = baseConnections.length
    const enabledBaseConnections = enabledBase.length
    const workingBaseConnections = workingConnections.length
    
    // Active Connections section: always show all 4 base as "total", only active-enabled as "active"
    const totalActiveConnections = baseConnections.length // All 4 base shown in Active section
    const enabledActiveCount = activeEnabledConnections.length // Only those with is_enabled_dashboard=1
    
    // Live vs Preset from active-enabled connections only
    let liveTradeCount = 0
    let presetTradeCount = 0
    
    for (const conn of activeEnabledConnections) {
      const liveEnabled = conn.live_trade_enabled === true || conn.live_trade_enabled === "1" || conn.is_live_trade === true || conn.is_live_trade === "1"
      const presetEnabled = conn.preset_trade_enabled === true || conn.preset_trade_enabled === "1" || conn.is_preset_trade === true || conn.is_preset_trade === "1"
      
      if (liveEnabled) liveTradeCount++
      if (presetEnabled) presetTradeCount++
    }
    
    console.log(`[v0] [SysStats-v7] Base: ${totalBaseConnections}, Enabled: ${enabledBaseConnections}, Working: ${workingBaseConnections}, Active: ${enabledActiveCount}`)
    
    // Trade Engine Status (read from Redis HASH - start endpoint uses hset)
    const engineStatus = await client.hgetall("trade_engine:global") || {}
    
    const globalStatus = engineStatus.status || "stopped"
    // Main/Preset derive from active connections: running if global=running AND at least 1 connection has it
    const mainStatus = globalStatus === "running" && liveTradeCount > 0 ? "running" : liveTradeCount > 0 ? "ready" : "stopped"
    const presetStatus = globalStatus === "running" && presetTradeCount > 0 ? "running" : presetTradeCount > 0 ? "ready" : "stopped"
    
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
        mainCount: liveTradeCount,
        mainTotal: enabledActiveCount,
        presetStatus,
        presetCount: presetTradeCount,
        presetTotal: enabledActiveCount,
        totalEnabled: liveTradeCount + presetTradeCount,
      },
      database: {
        status: dbStatus,
        requestsPerSecond: getRedisRequestsPerSecond(),
      },
      exchangeConnections: {
        total: totalBaseConnections,
        enabled: enabledBaseConnections,
        working: workingBaseConnections,
        status: exchangeStatus,
      },
      activeConnections: {
        total: totalActiveConnections,
        active: enabledActiveCount,
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
