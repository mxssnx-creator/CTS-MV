import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings, getRedisClient } from "@/lib/redis-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: connectionId } = await params
    
    await initRedis()
    const client = getRedisClient()

    // Get strategy stats from Redis
    const engineState = await getSettings(`trade_engine_state:${connectionId}`)
    
    // Scan for strategy keys to get counts
    const baseKey = `strategies:${connectionId}:*:base`
    const mainKey = `strategies:${connectionId}:*:main`
    const realKey = `strategies:${connectionId}:*:real`
    const liveKey = `strategies:${connectionId}:*:live`
    
    let baseCount = 0
    let mainCount = 0
    let realCount = 0
    let liveCount = 0
    
    try {
      // Get strategy counts from stored data
      const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] // Common symbols
      
      for (const symbol of symbols) {
        const baseData = await getSettings(`strategies:${connectionId}:${symbol}:base`)
        const mainData = await getSettings(`strategies:${connectionId}:${symbol}:main`)
        const realData = await getSettings(`strategies:${connectionId}:${symbol}:real`)
        const liveData = await getSettings(`strategies:${connectionId}:${symbol}:live`)
        
        baseCount += baseData?.count || baseData?.strategies?.length || 0
        mainCount += mainData?.count || mainData?.strategies?.length || 0
        realCount += realData?.count || realData?.strategies?.length || 0
        liveCount += liveData?.count || liveData?.strategies?.length || 0
      }
    } catch (e) {
      // Ignore scan errors
    }

    const totalStrategiesEvaluated = engineState?.total_strategies_evaluated || 0
    const strategyCycleCount = engineState?.strategy_cycle_count || 0

    const strategies = [
      {
        type: "base",
        enabled: true,
        rangeCount: baseCount,
        activePositions: baseCount,
        totalIndications: baseCount,
        successRate: baseCount > 0 ? 100 : 0,
      },
      {
        type: "main",
        enabled: true,
        rangeCount: mainCount,
        activePositions: mainCount,
        totalIndications: mainCount,
        successRate: baseCount > 0 ? (mainCount / baseCount * 100) : 0,
      },
      {
        type: "real",
        enabled: true,
        rangeCount: realCount,
        activePositions: realCount,
        totalIndications: realCount,
        successRate: mainCount > 0 ? (realCount / mainCount * 100) : 0,
      },
      {
        type: "live",
        enabled: true,
        rangeCount: liveCount,
        activePositions: liveCount,
        totalIndications: liveCount,
        successRate: realCount > 0 ? (liveCount / realCount * 100) : 0,
      },
    ]

    return NextResponse.json({
      success: true,
      connectionId,
      strategies,
      summary: {
        totalStrategiesEvaluated,
        strategyCycleCount,
        baseCount,
        mainCount,
        realCount,
        liveCount,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error fetching strategy stats:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to fetch strategies",
        strategies: []
      },
      { status: 200 }
    )
  }
}
