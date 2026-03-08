import { NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()

    // CPU and Memory estimation
    const cpuUsage = process.cpuUsage()
    const memUsage = process.memoryUsage()
    const cpuPercent = Math.min(100, Math.round((cpuUsage.user / 1000000) * 0.1))
    const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)

    // Redis key counts
    const allKeys = await client.keys("*").catch(() => [])
    const keys = Array.isArray(allKeys) ? allKeys.length : 0
    const sets = allKeys.filter((k: string) => k.includes(":set") || k.includes("_set")).length
    const positions1h = allKeys.filter((k: string) => k.includes("position")).length
    const entries1h = allKeys.filter((k: string) => k.includes("entry") || k.includes("indication")).length

    // Engine status from coordinator
    const coordinatorReady = coordinator?.isReady?.() ?? false
    const isEngineRunning = coordinator?.isRunning?.() ?? false
    const activeCount = coordinator?.getActiveEngineCount?.() ?? 0
    
    // Indication and strategy key counts from Redis
    const indicationKeyCount = allKeys.filter((k: string) => 
      k.includes("indication") || k.includes("indications:") || k.includes(":rsi") || k.includes(":macd")
    ).length
    const strategyKeyCount = allKeys.filter((k: string) => 
      k.includes("strategy") || k.includes("strategies:") || k.includes("entry:") || k.includes("signal:")
    ).length
    
    // Engine stats from Redis
    const indStatsStr = await client.get("engine:indications:stats").catch(() => null)
    const strStatsStr = await client.get("engine:strategies:stats").catch(() => null)
    const indStats = indStatsStr ? JSON.parse(indStatsStr) : {}
    const strStats = strStatsStr ? JSON.parse(strStatsStr) : {}
    
    const indCycles = indStats.cycleCount ?? 0
    const indResults = indStats.resultsCount ?? indicationKeyCount
    const indRunning = indStats.running ?? (isEngineRunning && activeCount > 0)
    
    const strCycles = strStats.cycleCount ?? 0
    const strResults = strStats.resultsCount ?? strategyKeyCount
    const strRunning = strStats.running ?? (isEngineRunning && activeCount > 0)

    console.log(`[v0] [Monitoring] Keys: ${keys}, CPU: ${cpuPercent}%, Mem: ${memPercent}%, Engine: ${isEngineRunning}`)

    return NextResponse.json({
      cpu: cpuPercent,
      memory: memPercent,
      memoryUsed: Math.round(memUsage.heapUsed / 1024),
      memoryTotal: Math.round(memUsage.heapTotal / 1024),
      services: {
        tradeEngine: isEngineRunning,
        indicationsEngine: indRunning,
        strategiesEngine: strRunning,
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
          running: indRunning,
          cycleCount: indCycles,
          resultsCount: indResults,
        },
        strategies: {
          running: strRunning,
          cycleCount: strCycles,
          resultsCount: strResults,
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] [Monitoring] Error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: "Failed to fetch metrics", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}
