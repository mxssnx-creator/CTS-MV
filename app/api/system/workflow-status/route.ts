import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

/**
 * GET /api/system/workflow-status
 * Returns complete workflow status for debugging and monitoring.
 * Shows what's working, what's needed, and next steps.
 */
export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    const allConnections = await getAllConnections()

    // Analyze connections
    const BASE_EXCHANGES = ["bybit", "bingx", "pionex", "orangex", "binance", "okx"]
    
    const baseConnections = allConnections.filter((c: any) => 
      BASE_EXCHANGES.includes((c?.exchange || "").toLowerCase())
    )
    
    const withCredentials = baseConnections.filter((c: any) => {
      const key = c.api_key || c.apiKey || ""
      const secret = c.api_secret || c.apiSecret || ""
      return key.length > 10 && secret.length > 10
    })
    
    const inActivePanel = baseConnections.filter((c: any) => 
      c.is_active_inserted === "1" || c.is_active_inserted === true
    )
    
    const dashboardEnabled = inActivePanel.filter((c: any) => 
      c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === true
    )
    
    const liveTradeEnabled = dashboardEnabled.filter((c: any) => 
      c.is_live_trade === "1" || c.is_live_trade === true
    )

    // Get engine state
    const engineHash = await client.hgetall("trade_engine:global") || {}
    const engineRunning = engineHash.status === "running"

    // Determine workflow phase
    let workflowPhase = "initial"
    let nextStep = ""
    let progress = 0
    
    if (baseConnections.length === 0) {
      workflowPhase = "no_connections"
      nextStep = "Initialize predefined connections via /api/settings/connections/init-predefined"
      progress = 0
    } else if (withCredentials.length === 0) {
      workflowPhase = "needs_credentials"
      nextStep = "Add API credentials to a connection in Settings > Exchange > Edit Connection"
      progress = 20
    } else if (inActivePanel.length === 0) {
      workflowPhase = "needs_active"
      nextStep = "Add a connection to Active panel via Dashboard"
      progress = 40
    } else if (dashboardEnabled.length === 0) {
      workflowPhase = "needs_enable"
      nextStep = "Enable a connection via the Dashboard toggle"
      progress = 60
    } else if (!engineRunning) {
      workflowPhase = "needs_engine"
      nextStep = "Start the Global Trade Engine"
      progress = 80
    } else if (liveTradeEnabled.length === 0) {
      workflowPhase = "ready_for_live"
      nextStep = "Enable Live Trading for a connection (optional)"
      progress = 90
    } else {
      workflowPhase = "fully_operational"
      nextStep = "System is fully operational - monitor dashboard for trades"
      progress = 100
    }

    // Get progression states for active connections
    const progressionStates: Record<string, any> = {}
    for (const conn of dashboardEnabled) {
      try {
        const progKey = `engine_progression:${conn.id}`
        const progData = await client.get(progKey)
        progressionStates[conn.id] = progData ? JSON.parse(String(progData)) : null
      } catch {
        progressionStates[conn.id] = null
      }
    }

    return NextResponse.json({
      success: true,
      workflowPhase,
      progress,
      nextStep,
      summary: {
        totalConnections: allConnections.length,
        baseConnections: baseConnections.length,
        withCredentials: withCredentials.length,
        inActivePanel: inActivePanel.length,
        dashboardEnabled: dashboardEnabled.length,
        liveTradeEnabled: liveTradeEnabled.length,
        engineRunning,
      },
      checklist: {
        connectionsExist: baseConnections.length > 0,
        credentialsConfigured: withCredentials.length > 0,
        addedToActivePanel: inActivePanel.length > 0,
        dashboardToggleEnabled: dashboardEnabled.length > 0,
        globalEngineRunning: engineRunning,
        liveTradeActive: liveTradeEnabled.length > 0,
      },
      details: {
        connectionsWithCredentials: withCredentials.map((c: any) => ({
          id: c.id,
          name: c.name,
          exchange: c.exchange,
        })),
        activeConnections: inActivePanel.map((c: any) => ({
          id: c.id,
          name: c.name,
          exchange: c.exchange,
          dashboardEnabled: c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === true,
          liveTrade: c.is_live_trade === "1" || c.is_live_trade === true,
        })),
        progressionStates,
      },
      endpoints: {
        initPredefined: "POST /api/settings/connections/init-predefined",
        testConnection: "POST /api/settings/connections/{id}/test",
        addToActive: "POST /api/settings/connections/add-to-active",
        toggleDashboard: "POST /api/settings/connections/{id}/toggle-dashboard",
        startEngine: "POST /api/trade-engine/start",
        enableLiveTrade: "POST /api/settings/connections/{id}/live-trade",
        demoSetup: "POST /api/system/demo-setup (with api_key, api_secret)",
      }
    })
  } catch (error) {
    console.error("[v0] [WorkflowStatus] Error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get workflow status"
    }, { status: 500 })
  }
}
