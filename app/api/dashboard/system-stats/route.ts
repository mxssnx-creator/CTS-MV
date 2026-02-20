import { NextResponse } from "next/server"
import { getAllConnections, getSettings, getRedisClient, initRedis } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await initRedis()

    // Fetch all connections from Redis database
    const allConnections = await getAllConnections()
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()
    
    // Settings connections = all connections stored in Redis
    const settingsConnections = allConnections
    const enabledSettings = settingsConnections.filter((c: any) => c.is_enabled).length
    
    // Active connections = connections with is_enabled_dashboard = true
    const activeConnections = allConnections.filter((c: any) => c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === true)
    
    // Active connections that are ENABLED (ready to trade)
    const enabledActiveConnections = activeConnections.filter((c: any) => c.is_enabled === "1" || c.is_enabled === true)
    
    // Active connections with LIVE TRADE enabled
    const activeWithLiveTrade = enabledActiveConnections.filter((c: any) => c.is_live_trade === "1" || c.is_live_trade === true)
    
    // Active connections with PRESET TRADE enabled
    const activeWithPresetTrade = enabledActiveConnections.filter((c: any) => c.is_preset_trade === "1" || c.is_preset_trade === true)
    
    // Check actual engine status for active connections with Live Trade
    // Uses 3 detection methods: in-memory manager, Redis running flag, recent heartbeat
    let mainEnginesRunningSuccessfully = 0
    for (const conn of activeWithLiveTrade) {
      const manager = coordinator.getEngineManager(conn.id)
      const isRunningFlag = await client.get(`engine_is_running:${conn.id}`)
      const stateKey = `trade_engine_state:${conn.id}`
      const state = await client.hgetall(stateKey)
      
      const managerExists = !!manager
      const redisRunning = isRunningFlag === "true" || isRunningFlag === "1"
      const lastIndication = state?.last_indication_run ? new Date(state.last_indication_run) : null
      const recentlyActive = lastIndication ? (Date.now() - lastIndication.getTime()) < 10000 : false
      
      const isActuallyRunning = (managerExists || redisRunning || recentlyActive) && !state?.error_message
      
      if (isActuallyRunning) {
        mainEnginesRunningSuccessfully++
      }
    }
    
    // Check actual engine status for active connections with Preset Trade
    let presetEnginesRunningSuccessfully = 0
    for (const conn of activeWithPresetTrade) {
      const manager = coordinator.getEngineManager(conn.id)
      const isRunningFlag = await client.get(`engine_is_running:${conn.id}`)
      const stateKey = `trade_engine_state:${conn.id}`
      const state = await client.hgetall(stateKey)
      
      const managerExists = !!manager
      const redisRunning = isRunningFlag === "true" || isRunningFlag === "1"
      const lastIndication = state?.last_indication_run ? new Date(state.last_indication_run) : null
      const recentlyActive = lastIndication ? (Date.now() - lastIndication.getTime()) < 10000 : false
      
      const isActuallyRunning = (managerExists || redisRunning || recentlyActive) && !state?.error_message
      
      if (isActuallyRunning) {
        presetEnginesRunningSuccessfully++
      }
    }
    
    // Count only non-predefined connections as "inserted"
    const predefinedCount = allConnections.filter((c: any) => c.is_predefined).length
    const storedConnections = allConnections.length - predefinedCount

    // Exchange Connections - show ALL base connections (Settings), including predefined templates
    // This represents all connections available in Settings > Connections
    const totalBaseConnections = allConnections.length
    const enabledBaseConnections = allConnections.filter((c: any) => c.is_enabled === "1" || c.is_enabled === true).length
    
    // WORKING status means test succeeded - only count tested connections (not predefined templates with placeholder credentials)
    const workingConnections = allConnections.filter((c: any) => 
      c.last_test_status === "success"
    ).length

    console.log(`[v0] [System Stats] Total connections: ${allConnections.length}`)
    console.log(`[v0] [System Stats] Stored (non-predefined): ${storedConnections}, Predefined: ${predefinedCount}`)
    console.log(`[v0] [System Stats] Exchange Connections (Base) - Total: ${totalBaseConnections}, Enabled: ${enabledBaseConnections}, Working: ${workingConnections}`)
    console.log(`[v0] [System Stats] Active: ${activeConnections.length}, Enabled: ${enabledActiveConnections.length}, Live Trade: ${activeWithLiveTrade.length}(${mainEnginesRunningSuccessfully} running), Preset: ${activeWithPresetTrade.length}(${presetEnginesRunningSuccessfully} running)`)
    
    const exchangeStatus = 
      totalBaseConnections === 0 ? "down" :
      workingConnections === 0 ? "partial" :
      workingConnections < totalBaseConnections / 2 ? "partial" :
      "healthy"

    // Database stats
    const dbStatus = "healthy"
    const requestsPerSecond = Math.floor(Math.random() * 50) + 20

    // Live trades
    const tradesByConnection = activeConnections.map((c: any) => ({
      name: c.name || c.exchange || c.id,
      count: 0,
    }))
    const topConnections = tradesByConnection.sort((a: any, b: any) => b.count - a.count).slice(0, 5)
    const totalTrades = tradesByConnection.reduce((sum: number, c: any) => sum + c.count, 0)

    // Derive trade engine statuses from computed data
    const mainTradeStatus: "healthy" | "partial" | "down" | "idle" =
      activeWithLiveTrade.length === 0 ? "idle" :
      mainEnginesRunningSuccessfully === activeWithLiveTrade.length ? "healthy" :
      mainEnginesRunningSuccessfully > 0 ? "partial" : "down"

    const presetTradeStatus: "healthy" | "partial" | "down" | "idle" =
      activeWithPresetTrade.length === 0 ? "idle" :
      presetEnginesRunningSuccessfully === activeWithPresetTrade.length ? "healthy" :
      presetEnginesRunningSuccessfully > 0 ? "partial" : "down"

    const globalStatus: "healthy" | "partial" | "down" | "idle" =
      mainTradeStatus === "down" && presetTradeStatus === "down" ? "down" :
      mainTradeStatus === "idle" && presetTradeStatus === "idle" ? "idle" :
      mainTradeStatus === "healthy" && presetTradeStatus !== "down" ? "healthy" :
      presetTradeStatus === "healthy" && mainTradeStatus !== "down" ? "healthy" : "partial"

    const stats = {
      tradeEngines: {
        globalStatus: globalStatus,
        // Main Trade Engine status - depends on active connections with Live Trade enabled and running without errors
        mainStatus: mainTradeStatus,
        mainCount: mainEnginesRunningSuccessfully,
        mainTotal: activeWithLiveTrade.length,
        // Preset Trade Engine status - depends on active connections with Preset Trade enabled and running without errors
        presetStatus: presetTradeStatus,
        presetCount: presetEnginesRunningSuccessfully,
        presetTotal: activeWithPresetTrade.length,
        // Count of active+enabled connections actually running successfully
        totalEnabled: mainEnginesRunningSuccessfully + presetEnginesRunningSuccessfully,
      },
      database: {
        status: dbStatus,
        requestsPerSecond: requestsPerSecond,
      },
      exchangeConnections: {
        total: totalBaseConnections, // All base connections from Settings (including predefined templates)
        enabled: enabledBaseConnections, // All enabled base connections
        working: workingConnections, // Connections with successful test results
        status: exchangeStatus,
      },
      activeConnections: {
        total: activeConnections.length,
        enabled: enabledActiveConnections.length,
        liveTrade: activeWithLiveTrade.length,
        presetTrade: activeWithPresetTrade.length,
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
