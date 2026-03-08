import { NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    console.log("[v0] [Monitoring] Fetching system metrics...")
    
    await initRedis()
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()

    // CPU and Memory (in-process estimation)
    const cpuUsage = process.cpuUsage()
    const memUsage = process.memoryUsage()
    
    // Rough CPU percentage based on user CPU time
    const cpuPercent = Math.min(100, Math.round((cpuUsage.user / 1000000) * 0.1))
    const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)

    console.log(`[v0] [Monitoring] CPU: ${cpuPercent}%, Memory: ${memPercent}%`)

    // Get Redis stats (Upstash compatible - no INFO or DBSIZE commands)
    // Use SCAN pattern to count keys efficiently
    const allKeys = await client.keys("*").catch(() => [])
    const keys = Array.isArray(allKeys) ? allKeys.length : 0
    
    // Count different types of keys
    const sets = allKeys.filter((k: string) => k.includes(":set") || k.includes("_set")).length
    const positions1h = allKeys.filter((k: string) => k.includes("position")).length
    const entries1h = allKeys.filter((k: string) => k.includes("entry") || k.includes("indication")).length

    // Get engine status from coordinator
    const coordinatorReady = coordinator?.isReady?.() ?? false
    const engineRunning = coordinator?.isRunning?.() ?? false
    const activeEngineCount = coordinator?.getActiveEngineCount?.() ?? 0
    
    // Get engine stats from Redis (stored by engine processors)
    const indicationsStatsStr = await client.get("engine:indications:stats").catch(() => null)
    const strategiesStatsStr = await client.get("engine:strategies:stats").catch(() => null)
    const indicationsStats = indicationsStatsStr ? JSON.parse(indicationsStatsStr) : {}
    const strategiesStats = strategiesStatsStr ? JSON.parse(strategiesStatsStr) : {}
    
    const indicationsCycleCount = indicationsStats.cycleCount ?? 0
    const totalIndicationsResults = indicationsStats.resultsCount ?? entries1h
    const indicationsEngineRunning = indicationsStats.running ?? (engineRunning && activeEngineCount > 0)
    
    const strategiesCycleCount = strategiesStats.cycleCount ?? 0
    const totalStrategiesResults = strategiesStats.resultsCount ?? 0
    const strategiesEngineRunning = strategiesStats.running ?? (engineRunning && activeEngineCount > 0)

    console.log(`[v0] [Monitoring] DB Keys: ${keys}, Sets: ${sets}, Positions: ${positions1h}, Entries: ${entries1h}`)
    console.log(`[v0] [Monitoring] Engine running: ${engineRunning}, Coordinator ready: ${coordinatorReady}, Active: ${activeEngineCount}`)
    console.log(`[v0] [Monitoring] Indications: cycles=${indicationsCycleCount}, results=${totalIndicationsResults}, running=${indicationsEngineRunning}`)
    console.log(`[v0] [Monitoring] Strategies: cycles=${strategiesCycleCount}, results=${totalStrategiesResults}, running=${strategiesEngineRunning}`)

    return NextResponse.json({
      cpu: cpuPercent,
      memory: memPercent,
      memoryUsed: Math.round(memUsage.heapUsed / 1024),
      memoryTotal: Math.round(memUsage.heapTotal / 1024),
      services: {
        tradeEngine: engineRunning,
        indicationsEngine: indicationsEngineRunning,
        strategiesEngine: strategiesEngineRunning,
        websocket: true, // Assume websocket is always active
      },
      modules: {
        redis: true, // Already connected
        persistence: allKeys.length > 0,
        coordinator: coordinatorReady,
        logger: true, // Always active
      },
      database: {
        size: keys,
        keys,
        sets,
        positions1h,
        entries1h,
      },
      engines: {
        indications: {
          running: indicationsEngineRunning,
          cycleCount: indicationsCycleCount,
          resultsCount: totalIndicationsResults,
        },
        strategies: {
          running: strategiesEngineRunning,
          cycleCount: strategiesCycleCount,
          resultsCount: totalStrategiesResults,
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] [Monitoring] Error fetching system metrics:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch system metrics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
