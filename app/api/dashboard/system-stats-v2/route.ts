import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getActiveConnectionsForEngine, getRedisClient } from "@/lib/redis-db"
import { RedisMonitoring } from "@/lib/redis-operations"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

// REBUILT 2026-02-20 - Complete rewrite without coordinator dependency
export async function GET() {
  console.log("[v0] [System Stats REBUILT] === ENDPOINT CALLED ===")
  
  try {
    await initRedis()
    const client = getRedisClient()
    
    // Get ALL connections (base connections from Settings)
    const allConnections = await getAllConnections()
    console.log(`[v0] [System Stats] getAllConnections returned: ${allConnections.length} connections`)
    
    // Get ONLY active connections (Dashboard enabled)
    const activeConnections = await getActiveConnectionsForEngine()
    console.log(`[v0] [System Stats] getActiveConnectionsForEngine returned: ${activeConnections.length} active connections`)
    
    // Count predefined vs inserted
    const predefinedCount = allConnections.filter((c: any) => c.is_predefined === true || c.is_predefined === "1").length
    const insertedCount = allConnections.length - predefinedCount
    
    console.log(`[v0] [System Stats] Predefined: ${predefinedCount}, Inserted: ${insertedCount}`)
    
    // Base Connections (ALL connections in Settings)
    const totalBaseConnections = allConnections.length
    const enabledBaseConnections = allConnections.filter((c: any) => 
      c.is_enabled === true || c.is_enabled === "1"
    ).length
    const workingBaseConnections = allConnections.filter((c: any) => 
      c.last_test_status === "success"
    ).length
    
    console.log(`[v0] [System Stats] Base Connections - Total: ${totalBaseConnections}, Enabled: ${enabledBaseConnections}, Working: ${workingBaseConnections}`)
    
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
    
    // Trade Engine Status (read from Redis key directly)
    const engineStatusRaw = await client.get("trade_engine:global")
    const engineStatus = engineStatusRaw ? JSON.parse(engineStatusRaw) : { status: "stopped" }
    
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
    
    // Live trades in last hour
    const liveTrades = await RedisMonitoring.getRecentActivity("live_trades", 3600)
    
    console.log(`[v0] [System Stats] Live trades in last hour: ${liveTrades.length}`)
    
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
