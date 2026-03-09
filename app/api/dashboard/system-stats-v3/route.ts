import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient, getRedisRequestsPerSecond } from "@/lib/redis-db"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const BASE_EXCHANGES = ["bybit", "bingx", "binance", "okx"]

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
    
    // BASE CONNECTIONS = All base exchange connections (predefined or user-created)
    // that are marked as enabled (is_enabled=1) in Settings
    const baseConnections = allConnections.filter((c: any) => {
      return isBaseExchange(c)
    })
    
    // ENABLED BASE = Base connections that are enabled in Settings
    const enabledBase = baseConnections.filter((c: any) => {
      const e = c.is_enabled
      return e === true || e === "1" || e === "true"
    })
    console.log(`[v0] [SystemStats] Base connections: ${baseConnections.length}, enabled: ${enabledBase.length}`)
    
    // ACTIVE PANEL = Connections marked as active-inserted (shown in Active Connections panel)
    // These can be predefined templates OR user-created connections
    const activeInsertedAll = allConnections.filter((c: any) => {
      const ai = c.is_active_inserted
      return ai === true || ai === "1" || ai === "true"
    })
    console.log(`[v0] [SystemStats] In Active panel: ${activeInsertedAll.length}`)
    
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
    
    // Get total Redis keys count - same pattern as monitoring route
    const allRedisKeys = await client.keys("*").catch(() => [])
    const totalKeys = Array.isArray(allRedisKeys) ? allRedisKeys.length : 0
    console.log(`[v0] [SystemStats] Total DB keys: ${totalKeys}`)

    // Trade Engine Status from Redis (stored as hash, not string)
    let globalEngineState: any = {}
    try {
      // trade_engine:global is stored as a hash using hset, so use hgetall
      const hashData = await client.hgetall("trade_engine:global")
      globalEngineState = hashData && Object.keys(hashData).length > 0 ? hashData : {}
    } catch {
      globalEngineState = {}
    }
    const globalStatus = globalEngineState.status || "stopped"

    // Main/Preset only show "running" when:
    // 1. Global engine is running AND
    // 2. At least one connection has the dashboard Enable slider ON (is_enabled_dashboard=1)
    //    AND that connection has live/preset trade enabled
    const anyDashboardEnabled = enabledDashboard.length > 0
    const mainStatus = globalStatus === "running" && anyDashboardEnabled && liveTradeCount > 0
      ? "running"
      : liveTradeCount > 0
      ? "ready"
      : "stopped"
    const presetStatus = globalStatus === "running" && anyDashboardEnabled && presetTradeCount > 0
      ? "running"
      : presetTradeCount > 0
      ? "ready"
      : "stopped"
    
    // Connections with valid credentials (can actually trade)
    const connectionsWithCredentials = baseConnections.filter((c: any) => {
      const hasKey = !!(c.api_key || c.apiKey) && (c.api_key || c.apiKey).length > 10
      const hasSecret = !!(c.api_secret || c.apiSecret) && (c.api_secret || c.apiSecret).length > 10
      return hasKey && hasSecret
    })
    console.log(`[v0] [SystemStats] Connections with valid credentials: ${connectionsWithCredentials.length}`)
    
    // REAL EXCHANGE CONNECTIONS = Inserted base connections with valid credentials only
    const realExchangeConnections = baseConnections.filter((c: any) => {
      const isInserted = c.is_active_inserted === true || c.is_active_inserted === "1" || c.is_active_inserted === "true"
      const hasKey = !!(c.api_key || c.apiKey) && (c.api_key || c.apiKey).length > 10
      const hasSecret = !!(c.api_secret || c.apiSecret) && (c.api_secret || c.apiSecret).length > 10
      return isInserted && hasKey && hasSecret
    })
    console.log(`[v0] [SystemStats] Real exchange connections (inserted + valid credentials): ${realExchangeConnections.length}`)
    
    // Exchange status: healthy if connections with credentials exist, otherwise waiting
    const exchangeStatus = 
      realExchangeConnections.length > 0 ? "healthy" :
      enabledBase.length > 0 ? "waiting" :
      baseConnections.length > 0 ? "partial" : "down"
    
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
        totalKeys,
      },
      exchangeConnections: {
        // Real exchange connections = inserted + valid credentials
        total: realExchangeConnections.length,
        enabled: realExchangeConnections.filter((c: any) => c.is_enabled === true || c.is_enabled === "1").length,
        working: realExchangeConnections.filter((c: any) => {
          const status = c.last_test_status || c.test_status || c.connection_status
          return status === "success" || status === "ok" || status === "connected"
        }).length,
        withCredentials: realExchangeConnections.length,
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
