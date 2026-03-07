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
    
    // Separate PREDEFINED (templates) from USER-CREATED (connections with credentials)
    const predefinedConnections = allConnections.filter((c: any) => {
      const p = c.is_predefined
      return p === true || p === "1" || p === "true"
    })
    const userCreatedConnections = allConnections.filter((c: any) => {
      const p = c.is_predefined
      return !(p === true || p === "1" || p === "true")
    })
    console.log(`[v0] [SystemStats] Connection breakdown: ${predefinedConnections.length} predefined, ${userCreatedConnections.length} user-created`)
    
    // ACTIVE PANEL = ALL connections with is_active_inserted = "1" (includes predefined templates)
    // This represents what's shown in the Active Connections panel
    const activeInsertedAll = allConnections.filter((c: any) => {
      const ai = c.is_active_inserted
      return ai === true || ai === "1" || ai === "true"
    })
    console.log(`[v0] [SystemStats] Active-inserted (all): ${activeInsertedAll.length} (${activeInsertedAll.map((c: any) => c.name).join(", ")})`)
    
    // ENABLED = connections that are enabled on dashboard toggle
    const enabledAll = allConnections.filter((c: any) => {
      const e = c.is_enabled_dashboard
      return e === true || e === "1" || e === "true"
    })
    console.log(`[v0] [SystemStats] Enabled on dashboard: ${enabledAll.length}`)
    
    // WORKING = connections where API test succeeded
    const workingAll = allConnections.filter((c: any) => {
      const status = c.last_test_status || c.test_status || c.connection_status
      return status === "success" || status === "ok" || status === "connected"
    })
    console.log(`[v0] [SystemStats] Working/tested: ${workingAll.length}`)
    
    // BASE EXCHANGES in Settings = base exchange connections (predefined or user-created)
    const baseExchangeConnections = allConnections.filter(isBaseExchange)
    const enabledBase = baseExchangeConnections.filter((c: any) => {
      const e = c.is_enabled
      return e === true || e === "1" || e === "true"
    })
    console.log(`[v0] [SystemStats] Base exchanges: ${baseExchangeConnections.length}, enabled: ${enabledBase.length}`)
    
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
    
    // Exchange status based on active-inserted connections
    const exchangeStatus = 
      activeInsertedAll.length === 0 ? "down" :
      enabledAll.length === 0 ? "partial" :
      enabledAll.length < activeInsertedAll.length ? "partial" : "healthy"
    
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
        total: activeInsertedAll.length,
        enabled: enabledAll.length,
        working: workingAll.length,
        status: exchangeStatus,
      },
      activeConnections: {
        total: activeInsertedAll.length,
        active: enabledAll.length,
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
