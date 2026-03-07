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
    
    // BASE CONNECTIONS = Real connections (is_predefined=false) that can be used for trading
    // These are created from predefined exchange info and are ENABLED by default in Settings
    const baseConnections = allConnections.filter((c: any) => {
      const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
      return !isPredefined && isBaseExchange(c)
    })
    
    // ENABLED BASE = Base connections that are enabled in Settings
    const enabledBase = baseConnections.filter((c: any) => {
      const e = c.is_enabled
      return e === true || e === "1" || e === "true"
    })
    console.log(`[v0] [SystemStats] Base connections: ${baseConnections.length}, enabled in Settings: ${enabledBase.length}`)
    
    // ACTIVE PANEL = USER-CREATED connections inserted into Active Connections panel
    // Predefined templates should NEVER be in Active panel - they are informational only
    const activeInsertedAll = allConnections.filter((c: any) => {
      const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
      if (isPredefined) return false // Skip predefined templates
      const ai = c.is_active_inserted
      return ai === true || ai === "1" || ai === "true"
    })
    console.log(`[v0] [SystemStats] In Active panel (user-created only): ${activeInsertedAll.length}`)
    
    // ENABLED ON DASHBOARD = Active connections that user has toggled ON
    const enabledDashboard = activeInsertedAll.filter((c: any) => {
      const e = c.is_enabled_dashboard
      return e === true || e === "1" || e === "true"
    })
    console.log(`[v0] [SystemStats] Enabled on dashboard: ${enabledDashboard.length}`)
    
    // WORKING = Connections where API test succeeded
    const workingAll = allConnections.filter((c: any) => {
      const status = c.last_test_status || c.test_status || c.connection_status
      return status === "success" || status === "ok" || status === "connected"
    })
    console.log(`[v0] [SystemStats] Working/tested: ${workingAll.length}`)
    
    // Live vs Preset counts from active-inserted connections
    let liveTradeCount = 0
    let presetTradeCount = 0
    for (const conn of activeInsertedAll) {
      if (conn.live_trade_enabled === true || conn.live_trade_enabled === "1" || conn.is_live_trade === true || conn.is_live_trade === "1") liveTradeCount++
      if (conn.preset_trade_enabled === true || conn.preset_trade_enabled === "1" || conn.is_preset_trade === true || conn.is_preset_trade === "1") presetTradeCount++
    }
    
    // Trade Engine Status from Redis
    let globalEngineState: any = {}
    try {
      const globalStateStr = await client.get("trade_engine:global")
      globalEngineState = globalStateStr ? JSON.parse(globalStateStr) : {}
    } catch {
      globalEngineState = {}
    }
    const globalStatus = globalEngineState.status || "stopped"
    const mainStatus = globalStatus === "running" && liveTradeCount > 0 ? "running" : liveTradeCount > 0 ? "ready" : "stopped"
    const presetStatus = globalStatus === "running" && presetTradeCount > 0 ? "running" : presetTradeCount > 0 ? "ready" : "stopped"
    
    // Exchange status based on base connections
    const exchangeStatus = 
      baseConnections.length === 0 ? "down" :
      enabledBase.length === 0 ? "partial" :
      enabledBase.length < baseConnections.length ? "partial" : "healthy"
    
    return NextResponse.json({
      success: true,
      tradeEngines: {
        globalStatus,
        mainStatus,
        mainCount: liveTradeCount,
        mainTotal: activeInsertedAll.length,
        presetStatus,
        presetCount: presetTradeCount,
        presetTotal: activeInsertedAll.length,
        totalEnabled: liveTradeCount + presetTradeCount,
      },
      database: {
        status: "healthy",
        requestsPerSecond: getRedisRequestsPerSecond(),
      },
      exchangeConnections: {
        // Base connections = available in Settings
        total: baseConnections.length,
        enabled: enabledBase.length,
        working: workingAll.length,
        status: exchangeStatus,
      },
      activeConnections: {
        // Active panel connections
        total: activeInsertedAll.length,
        active: enabledDashboard.length,
        liveTrade: liveTradeCount,
        presetTrade: presetTradeCount,
      },
      // Available connections = enabled base connections NOT yet in Active panel
      availableConnections: enabledBase.filter((c: any) => {
        const ai = c.is_active_inserted
        return !(ai === true || ai === "1" || ai === "true")
      }).length,
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
