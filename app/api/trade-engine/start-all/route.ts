import { NextResponse } from "next/server"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { initRedis, getAllConnections } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

export async function GET() {
  try {
    const coordinator = getGlobalTradeEngineCoordinator()
    
    if (!coordinator) {
      console.warn("[v0] [START-ALL] Coordinator is null - engines may not be initialized yet")
      return NextResponse.json({
        success: false,
        error: "Trade engine coordinator not initialized",
        results: [],
      }, { status: 503 })
    }

    await initRedis()
    const connections = await getAllConnections()
    
    if (!Array.isArray(connections)) {
      console.error("[v0] [START-ALL] Connections is not an array:", typeof connections)
      return NextResponse.json({
        success: false,
        error: "Invalid connections data",
        results: [],
      }, { status: 500 })
    }

    // Filter for enabled connections with live trade active
    const activeConnections = connections.filter((c) => 
      (c.is_enabled === "1" || c.is_enabled === true) && 
      (c.is_live_trade === "1" || c.is_live_trade === true)
    )

    console.log(`[v0] [START-ALL] Found ${activeConnections.length} active connections with live trade enabled`)

    if (activeConnections.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active connections with live trade enabled",
        totalConnections: connections.length,
        enabledConnections: 0,
        results: [],
      })
    }

    const indicationInterval = settings.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 5
    const strategyInterval = settings.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 10
    const realtimeInterval = settings.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 3

    const results = []
    let successCount = 0

    for (const connection of enabledConnections) {
      try {
        console.log(`[v0] [START-ALL] Starting engine: ${connection.name}`)

        await coordinator.startEngine(connection.id, {
          connectionId: connection.id,
          indicationInterval,
          strategyInterval,
          realtimeInterval,
        })

        results.push({
          connectionId: connection.id,
          connectionName: connection.name,
          exchange: connection.exchange,
          success: true,
          message: "Engine started successfully",
        })

        successCount++

        await SystemLogger.logTradeEngine(
          `Engine started by start-all endpoint for ${connection.name}`,
          "info",
          { connectionId: connection.id, exchange: connection.exchange }
        )
      } catch (error) {
        console.error(`[v0] [START-ALL] Failed to start ${connection.name}:`, error)

        results.push({
          connectionId: connection.id,
          connectionName: connection.name,
          exchange: connection.exchange,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })

        await SystemLogger.logError(
          error,
          "trade-engine",
          `Start-all failed for ${connection.name}`
        )
      }
    }

    console.log(`[v0] [START-ALL] Complete: ${successCount}/${enabledConnections.length} started`)

    return NextResponse.json({
      success: true,
      message: `Started ${successCount} of ${enabledConnections.length} trade engines`,
      totalConnections: connections.length,
      enabledConnections: enabledConnections.length,
      successCount,
      results,
    })
  } catch (error) {
    console.error("[v0] [START-ALL] Error:", error)

    await SystemLogger.logError(
      error,
      "trade-engine",
      "Start-all endpoint failed"
    )

    return NextResponse.json(
      {
        success: false,
        error: "Failed to start trade engines",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
