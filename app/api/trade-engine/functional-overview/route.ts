import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getRedisClient, getAllConnections } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"

// GET functional overview metrics
// Returns real-time information about what's currently running:
// - Active symbols being traded
// - Indications calculated
// - Strategies evaluated
// - Sets created (base, main, real)
// - DB position entries created
export async function GET() {
  try {
    console.log("[v0] [FunctionalOverview] Fetching system metrics...")
    
    await initRedis()
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()

    // Get active symbols count
    const allConnections = await getAllConnections()
    const enabledConnections = allConnections.filter(c => 
      (c.is_enabled === "1" || c.is_enabled === true) &&
      (c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === true)
    )
    
    // Get main engine config to find how many symbols are configured
    const mainConfigKey = await client.hgetall("trade_engine:main_config")
    const configuredSymbols = Array.isArray(mainConfigKey?.symbols) 
      ? mainConfigKey.symbols.length 
      : (mainConfigKey?.symbols_count || 15)

    // Get indication metrics from Redis
    const indicationMetrics = await client.hgetall("metrics:indications")
    const indicationsCalculated = parseInt(indicationMetrics?.calculated_count || "0") || 0

    // Get strategy metrics from Redis
    const strategyMetrics = await client.hgetall("metrics:strategies")
    const strategiesEvaluated = parseInt(strategyMetrics?.evaluated_count || "0") || 0

    // Check if sets are created
    const baseSetsExist = await client.exists("data:base_set")
    const mainSetsExist = await client.exists("data:main_set")
    const realSetsExist = await client.exists("data:real_set")

    // Get position entries count from Redis
    const positionKeys = await client.keys("positions:*")
    const positionsCount = positionKeys.length

    // Get in-memory persistence stats
    const persistenceKeys = await client.keys("persistence:*")
    console.log(`[v0] [FunctionalOverview] Metrics: symbols=${configuredSymbols}, indications=${indicationsCalculated}, strategies=${strategiesEvaluated}, positions=${positionsCount}`)

    return NextResponse.json({
      symbolsActive: configuredSymbols,
      indicationsCalculated,
      strategiesEvaluated,
      baseSetsCreated: baseSetsExist > 0,
      mainSetsCreated: mainSetsExist > 0,
      realSetsCreated: realSetsExist > 0,
      positionsEntriesCreated: positionsCount,
      enabledConnections: enabledConnections.length,
      persistenceKeys: persistenceKeys.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] [FunctionalOverview] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to get functional overview",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
