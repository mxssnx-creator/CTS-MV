import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient, getActiveConnectionsForEngine } from "@/lib/redis-db"
import { RedisMonitoring } from "@/lib/redis-operations"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

// Force rebuild timestamp: 2026-02-20T21:15:00Z
export async function GET() {
  console.log("[v0] [System Stats v4-REBUILD] === SYSTEM STATS ENDPOINT CALLED ===")
  try {
    await initRedis()
    const client = getRedisClient()

    // Get database health
    const dbHealth = await RedisMonitoring.getHealth(client)
    const dbStatus = dbHealth.status === "ok" ? "healthy" : "down"

    // Get all connections (for Settings/Exchange Connections count)
    const allConnections = await getAllConnections()
    console.log(`[v0] [System Stats] Total connections from getAllConnections(): ${allConnections.length}`)

    // Get active connections (for Active Connections/Dashboard count)
    const activeConnections = await getActiveConnectionsForEngine()
    console.log(`[v0] [System Stats] Active connections from getActiveConnectionsForEngine(): ${activeConnections.length}`)

    // Count predefined vs inserted
    const predefinedCount = allConnections.filter((c: any) => c.is_predefined === true || c.is_predefined === "1").length
    const insertedCount = allConnections.length - predefinedCount

    console.log(`[v0] [System Stats] Predefined: ${predefinedCount}, Inserted: ${insertedCount}`)

    // Exchange Connections section = ALL base connections (Settings)
    const totalBaseConnections = allConnections.length
    const enabledBaseConnections = allConnections.filter((c: any) => 
      c.is_enabled === true || c.is_enabled === "1"
    ).length
    const workingBaseConnections = allConnections.filter((c: any) => 
      c.last_test_status === "success"
    ).length

    console.log(`[v0] [System Stats] Base Connections (Settings) - Total: ${totalBaseConnections}, Enabled: ${enabledBaseConnections}, Working: ${workingBaseConnections}`)

    const exchangeStatus = 
      totalBaseConnections === 0 ? "down" :
      workingBaseConnections === 0 ? "partial" :
      workingBaseConnections < totalBaseConnections / 2 ? "partial" :
      "healthy"

    // Active Connections section = ONLY dashboard-enabled connections
    const totalActiveConnections = activeConnections.length
    const enabledActiveConnections = activeConnections.filter((c: any) => 
      c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1"
    ).length
    
    // Live Trade vs Preset Mode counts
    const liveTradingActive = activeConnections.filter((c: any) => {
      const liveEnabled = c.live_trade_enabled === true || c.live_trade_enabled === "1"
      const isDashboardEnabled = c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1"
      return liveEnabled && isDashboardEnabled
    }).length

    const presetTradingActive = activeConnections.filter((c: any) => {
      const presetEnabled = c.preset_trade_enabled === true || c.preset_trade_enabled === "1"
      const isDashboardEnabled = c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1"
      return presetEnabled && isDashboardEnabled
    }).length

    console.log(`[v0] [System Stats] Active Connections (Dashboard) - Total: ${totalActiveConnections}, Enabled: ${enabledActiveConnections}, Live: ${liveTradingActive}, Preset: ${presetTradingActive}`)

    // Trade Engine status
    const engineStatusRaw = await client.get("trade_engine:global")
    const engineStatus = engineStatusRaw ? JSON.parse(engineStatusRaw) : { status: "stopped" }

    const globalEngineStatus = engineStatus.status || "stopped"
    const mainEngineStatus = engineStatus.main_status || "stopped"
    const presetEngineStatus = engineStatus.preset_status || "stopped"

    // Count how many engines are enabled/running
    const enginesEnabled = 
      (globalEngineStatus === "running" ? 1 : 0) +
      (mainEngineStatus === "running" ? 1 : 0) +
      (presetEngineStatus === "running" ? 1 : 0)

    console.log(`[v0] [System Stats] Trade Engines - Global: ${globalEngineStatus}, Main: ${mainEngineStatus}, Preset: ${presetEngineStatus}, Total Enabled: ${enginesEnabled}`)

    // Live trades in last hour (from active connections only)
    let recentTradesCount = 0
    const oneHourAgo = Date.now() - 60 * 60 * 1000

    for (const conn of activeConnections) {
      try {
        const tradesKey = `trades:${conn.id}`
        const tradeIds = await client.smembers(tradesKey)
        
        for (const tradeId of tradeIds) {
          const tradeData = await client.get(`trade:${tradeId}`)
          if (tradeData) {
            const trade = JSON.parse(tradeData)
            if (trade.timestamp && trade.timestamp > oneHourAgo) {
              recentTradesCount++
            }
          }
        }
      } catch (error) {
        console.error(`[v0] [System Stats] Error counting trades for ${conn.id}:`, error)
      }
    }

    console.log(`[v0] [System Stats] Recent trades (last hour): ${recentTradesCount}`)

    // Top connections by trade count
    const connectionTradesCounts = await Promise.all(
      activeConnections.slice(0, 5).map(async (conn: any) => {
        try {
          const tradesKey = `trades:${conn.id}`
          const count = await client.scard(tradesKey)
          return { connectionId: conn.id, name: conn.name, trades: count }
        } catch {
          return { connectionId: conn.id, name: conn.name, trades: 0 }
        }
      })
    )

    const topConnections = connectionTradesCounts.sort((a, b) => b.trades - a.trades).slice(0, 3)

    const responseData = {
      tradeEngines: {
        globalStatus: globalEngineStatus,
        mainStatus: mainEngineStatus,
        presetStatus: presetEngineStatus,
        totalEnabled: enginesEnabled,
      },
      database: {
        status: dbStatus,
        requestsPerSecond: dbHealth.rps || 0,
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
        liveTrade: liveTradingActive,
        presetTrade: presetTradingActive,
      },
      liveTrades: {
        lastHour: recentTradesCount,
        topConnections,
      },
    }

    console.log("[v0] [System Stats] Response prepared successfully")
    return NextResponse.json(responseData)
  } catch (error) {
    console.error("[v0] [System Stats] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch system stats",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
