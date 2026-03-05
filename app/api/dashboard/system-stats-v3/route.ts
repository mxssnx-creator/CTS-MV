import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient, getRedisRequestsPerSecond } from "@/lib/redis-db"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const BASE_EXCHANGES = ["bybit", "bingx", "pionex", "orangex", "binance", "okx"]

function isBaseExchange(c: any): boolean {
  return BASE_EXCHANGES.includes((c?.exchange || "").toLowerCase().trim())
}

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    
    // Double-ensure Redis is ready and connections are loaded
    let allConnections = await getAllConnections()
    
    // If no connections found, try fetching directly from Redis
    if (allConnections.length === 0) {
      const connectionIds = await client.smembers("connections")
      console.log(`[v0] [SystemStats] Direct Redis lookup: found ${connectionIds?.length || 0} connection IDs`)
      
      if (connectionIds && connectionIds.length > 0) {
        const conns = []
        for (const id of connectionIds) {
          const data = await client.hgetall(`connection:${id}`)
          if (data && Object.keys(data).length > 0) {
            conns.push(data)
          }
        }
        allConnections = conns
      }
    }
    
    console.log(`[v0] [SystemStats] Analyzing ${allConnections.length} total connections`)
    
    // Separate PREDEFINED (templates/information) from USER-CREATED (actual connections)
    const predefinedConnections = allConnections.filter((c: any) => {
      const p = c.is_predefined
      return p === true || p === "1" || p === "true"
    })
    const userCreatedConnections = allConnections.filter((c: any) => {
      const p = c.is_predefined
      return !(p === true || p === "1" || p === "true")
    })
    console.log(`[v0] [SystemStats] Connection breakdown: ${predefinedConnections.length} predefined templates, ${userCreatedConnections.length} user-created`)
    
    // BASE = 6 primary exchanges (use ONLY user-created for metrics)
    const baseConnections = userCreatedConnections.filter(isBaseExchange)
    console.log(`[v0] [SystemStats] User-created base exchanges: ${baseConnections.length} connections (${baseConnections.map(c => c.exchange).join(", ")})`)
    
    const enabledBase = baseConnections.filter((c: any) => {
      const e = c.is_enabled
      return e === true || e === "1" || e === "true" || e === undefined || e === null
    })
    console.log(`[v0] [SystemStats] Enabled user-created base: ${enabledBase.length}`)
    
    // Check multiple test status field names and values
    const workingBase = baseConnections.filter((c: any) => {
      const status = c.last_test_status || c.test_status || c.connection_status
      return status === "success" || status === "ok" || status === "connected"
    })
    console.log(`[v0] [SystemStats] Working/tested user-created base: ${workingBase.length}`)
    
    // ACTIVE = connections with is_active_inserted = "1" (inserted for dashboard management)
    // These are BingX and Bybit — inserted but not yet enabled for trading
    const activeConnections = userCreatedConnections.filter((c: any) => {
      const ai = c.is_active_inserted
      return ai === true || ai === "1" || ai === "true"
    })
    console.log(`[v0] [SystemStats] Active-inserted user-created connections: ${activeConnections.length} (${activeConnections.map((c: any) => c.exchange).join(", ")})`)
    
    // Predefined connections shown as informational only
    console.log(`[v0] [SystemStats] Available predefined templates: ${predefinedConnections.length} (${predefinedConnections.map(c => `${c.exchange}:${c.name}`).join(", ")})`)
    
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
