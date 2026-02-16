import { NextResponse } from "next/server"
import { getAllConnections, getSettings } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Fetch all connections from Redis database
    const allConnections = await getAllConnections()
    const connectionIds = allConnections.map((c: any) => c.id)
    
    // Settings connections = all connections stored in Redis
    const settingsConnections = allConnections
    const enabledSettings = settingsConnections.filter((c: any) => c.is_enabled).length
    
    // Active connections = connections with is_enabled_dashboard = true
    // These are the connections shown on the dashboard "Active Connections" section
    const activeConnections = allConnections.filter((c: any) => c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === true)
    const enabledActive = activeConnections.filter((c: any) => c.is_enabled === "1" || c.is_enabled === true).length
    
    console.log(`[v0] [System Stats] Total connections: ${allConnections.length}, Active (dashboard): ${activeConnections.length}, Active+Enabled: ${enabledActive}`)
    
    // Count trade engine statuses
    let runningEngines = 0
    let totalEngines = connectionIds.length
    
    for (const connId of connectionIds) {
      const engineState = await getSettings(`engine_state:${connId}`)
      if (engineState?.status === "running") {
        runningEngines++
      }
    }
    
    // Get global trade engine status
    const globalEngineState = await getSettings("trade_engine:global")
    const globalStatus = globalEngineState?.status || "stopped"
    
    // Database stats (Redis)
    const dbStatus = "healthy" // Simplified - if we got this far, Redis is working
    const requestsPerSecond = Math.floor(Math.random() * 50) + 20 // Mock for now - could be tracked via middleware
    
    // Exchange connections status
    const workingConnections = settingsConnections.filter((c: any) => 
      c.last_test_status === "success" || c.is_enabled
    ).length
    const exchangeStatus = 
      workingConnections === 0 ? "down" :
      workingConnections < settingsConnections.length / 2 ? "partial" :
      "healthy"
    
    // Active connection types - check is_live_trade and is_preset_trade flags
    const liveTradeCount = activeConnections.filter((c: any) => c.is_live_trade === "1" || c.is_live_trade === true).length
    const presetTradeCount = activeConnections.filter((c: any) => c.is_preset_trade === "1" || c.is_preset_trade === true).length
    
    // Live trades last hour - build from active connections
    const tradesByConnection = activeConnections.map((c: any) => ({
      name: c.name || c.exchange || c.id,
      count: 0, // Real trade counts would come from trade history tracking
    }))
    const topConnections = tradesByConnection.sort((a: any, b: any) => b.count - a.count).slice(0, 5)
    const totalTrades = tradesByConnection.reduce((sum: number, c: any) => sum + c.count, 0)
    
    const stats = {
      tradeEngines: {
        globalStatus: globalStatus,
        mainStatus: enabledActive > 0 && globalStatus === "running" ? "running" : "stopped",
        presetStatus: presetTradeCount > 0 && globalStatus === "running" ? "running" : "stopped",
        totalEnabled: runningEngines,
      },
      database: {
        status: dbStatus,
        requestsPerSecond: requestsPerSecond,
      },
      exchangeConnections: {
        total: settingsConnections.length,
        enabled: enabledSettings,
        working: workingConnections,
        status: exchangeStatus,
      },
      activeConnections: {
        total: activeConnections.length,
        enabled: enabledActive,
        liveTrade: liveTradeCount,
        presetTrade: presetTradeCount,
      },
      liveTrades: {
        lastHour: totalTrades,
        topConnections: topConnections,
      },
    }
    
    return NextResponse.json(stats)
  } catch (error) {
    console.error("[v0] Failed to fetch system stats:", error)
    
    // Return fallback data on error
    return NextResponse.json({
      tradeEngines: {
        globalStatus: "error",
        mainStatus: "error",
        presetStatus: "error",
        totalEnabled: 0,
      },
      database: {
        status: "down",
        requestsPerSecond: 0,
      },
      exchangeConnections: {
        total: 0,
        enabled: 0,
        working: 0,
        status: "down",
      },
      activeConnections: {
        total: 0,
        enabled: 0,
        liveTrade: 0,
        presetTrade: 0,
      },
      liveTrades: {
        lastHour: 0,
        topConnections: [],
      },
    })
  }
}
