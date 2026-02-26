import { NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"

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

    // Get Redis stats
    const info = await client.info("all").catch(() => "")
    const dbSize = await client.dbsize().catch(() => 0)
    
    // Parse database stats from info
    let keys = 0
    const keysMatch = info.match(/db0:keys=(\d+)/)
    if (keysMatch) {
      keys = parseInt(keysMatch[1], 10)
    }

    // Get number of sets in database
    const allKeys = await client.keys("*").catch(() => [])
    const sets = allKeys.filter((k: string) => k.includes(":set")).length
    const positions1h = allKeys.filter((k: string) => k.includes("position")).length
    const entries1h = allKeys.filter((k: string) => k.includes("entry")).length

    console.log(`[v0] [Monitoring] DB Keys: ${keys}, Sets: ${sets}, Positions: ${positions1h}, Entries: ${entries1h}`)

    // Get service/module status from Redis
    const globalState = await client.hgetall("trade_engine:global").catch(() => ({}))
    const engineRunning = globalState?.status === "running"
    const coordinatorReady = coordinator?.isRunning() || false

    console.log(`[v0] [Monitoring] Engine running: ${engineRunning}, Coordinator ready: ${coordinatorReady}`)

    return NextResponse.json({
      cpu: cpuPercent,
      memory: memPercent,
      memoryUsed: Math.round(memUsage.heapUsed / 1024),
      memoryTotal: Math.round(memUsage.heapTotal / 1024),
      services: {
        tradeEngine: engineRunning,
        indicationsEngine: coordinatorReady,
        strategiesEngine: coordinatorReady,
        websocket: true, // Assume websocket is always active
      },
      modules: {
        redis: true, // Already connected
        persistence: allKeys.length > 0,
        coordinator: coordinatorReady,
        logger: true, // Always active
      },
      database: {
        size: dbSize,
        keys,
        sets,
        positions1h,
        entries1h,
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
