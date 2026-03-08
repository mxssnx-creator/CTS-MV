import { NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()

    // CPU and Memory (in-process estimation)
    const cpuUsage = process.cpuUsage()
    const memUsage = process.memoryUsage()
    const cpuPercent = Math.min(100, Math.round((cpuUsage.user / 1000000) * 0.1))
    const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)

    // Get Redis key counts
    const allKeys = await client.keys("*").catch(() => [])
    const keys = Array.isArray(allKeys) ? allKeys.length : 0
    const sets = allKeys.filter((k: string) => k.includes(":set") || k.includes("_set")).length
    const positions1h = allKeys.filter((k: string) => k.includes("position")).length
    const entries1h = allKeys.filter((k: string) => k.includes("entry") || k.includes("indication")).length

    // Get engine status - define ALL variables BEFORE using them
    const coordinatorReady = coordinator?.isReady?.() ?? false
    const engineRunning = coordinator?.isRunning?.() ?? false
    const activeEngineCount = coordinator?.getActiveEngineCount?.() ?? 0
    
    // Count actual indications and strategies in Redis
    const indicationKeys = allKeys.filter((k: string) => 
      k.includes("indication") || k.includes("indications:") || k.includes(":rsi") || k.includes(":macd") || k.includes(":ema")
    ).length
    const strategyKeys = allKeys.filter((k: string) => 
      k.includes("strategy") || k.includes("strategies:") || k.includes("entry:") || k.includes("signal:")
    ).length
    const entryKeys = allKeys.filter((k: string) => k.includes("entry:") || k.includes("entries:")).length
    
    // Get engine stats from Redis (may not exist yet)
    const indicationsStatsStr = await client.get("engine:indications:stats").catch(() => null)
    const strategiesStatsStr = await client.get("engine:strategies:stats").catch(() => null)
    const indicationsStats = indicationsStatsStr ? JSON.parse(indicationsStatsStr) : {}
    const strategiesStats = strategiesStatsStr ? JSON.parse(strategiesStatsStr) : {}
    
    // Use actual Redis counts as fallback when stats not available
    const indicationsCycleCount = indicationsStats.cycleCount ?? 0
    const totalIndicationsResults = indicationsStats.resultsCount ?? indicationKeys ?? entries1h
    const indicationsEngineRunning = indicationsStats.running ?? (engineRunning && activeEngineCount > 0)
    
    const strategiesCycleCount = strategiesStats.cycleCount ?? 0
    const totalStrategiesResults = strategiesStats.resultsCount ?? strategyKeys ?? entryKeys
    const strategiesEngineRunning = strategiesStats.running ?? (engineRunning && activeEngineCount > 0)

    // Log AFTER all variables are defined
    console.log(`[v0] [Monitoring] DB Keys: ${keys}, CPU: ${cpuPercent}%, Mem: ${memPercent}%`)
    console.log(`[v0] [Monitoring] Engine: running=${engineRunning}, ready=${coordinatorReady}, active=${activeEngineCount}`)

    return NextResponse.json({
      cpu: cpuPercent,
      memory: memPercent,
      memoryUsed: Math.round(memUsage.heapUsed / 1024),
      memoryTotal: Math.round(memUsage.heapTotal / 1024),
      services: {
        tradeEngine: engineRunning,
        indicationsEngine: indicationsEngineRunning,
        strategiesEngine: strategiesEngineRunning,
        websocket: true,
      },
      modules: {
        redis: true,
        persistence: keys > 0,
        coordinator: coordinatorReady,
        logger: true,
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
    console.error("[v0] [Monitoring] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch metrics", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}
