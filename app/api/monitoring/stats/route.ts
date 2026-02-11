import { NextResponse, type NextRequest } from "next/server"
import { initRedis, getAllConnections, getRedisHelpers } from "@/lib/redis-db"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const exchangeFilter = searchParams.get("exchange")
    
    console.log("[v0] [API] GET /api/monitoring/stats - Exchange filter:", exchangeFilter || "all")
    
    await initRedis()
    const redis = await getRedisHelpers()

    // Get all connections, optionally filtered by exchange
    let connections = await getAllConnections()
    if (exchangeFilter) {
      connections = connections.filter((c: any) => c.exchange === exchangeFilter)
      console.log("[v0] [API] Filtered to", connections.length, "connections for exchange:", exchangeFilter)
    }
    const activeConnections = connections.filter((c: any) => c.is_active === true || c.is_active === "true")
    
    // Get positions and trades, filtered by exchange if specified
    let allPositions = await redis.getAllPositions()
    if (exchangeFilter) {
      const exchangeConnectionIds = connections.map((c: any) => c.id)
      allPositions = allPositions.filter((p) => exchangeConnectionIds.includes(p.connection_id))
      console.log("[v0] [API] Filtered to", allPositions.length, "positions for exchange:", exchangeFilter)
    }
    const openPositions = allPositions.filter((p) => p.status === "open")
    const closedPositions = allPositions.filter((p) => p.status === "closed")
    
    // Calculate real P&L from positions
    let dailyPnL = 0
    let totalBalance = 0
    
    closedPositions.forEach((pos) => {
      const pnl = pos.realized_pnl || 0
      dailyPnL += pnl
    })
    
    openPositions.forEach((pos) => {
      const pnl = pos.unrealized_pnl || 0
      totalBalance += pnl
    })
    
    // Get indications and strategies count, filtered by exchange if specified
    let allIndications = await redis.getActiveIndications()
    let allStrategies = await redis.getActiveStrategies()
    
    if (exchangeFilter) {
      const exchangeConnectionIds = connections.map((c: any) => c.id)
      allIndications = allIndications.filter((ind) => exchangeConnectionIds.includes(ind.connection_id))
      allStrategies = allStrategies.filter((strat) => exchangeConnectionIds.includes(strat.connection_id))
      console.log("[v0] [API] Filtered to", allIndications.length, "indications and", allStrategies.length, "strategies")
    }
    
    // Get system stats
    const stats = await redis.getRedisStats()
    const databaseSize = Math.round((stats.keyCount || 0) / 1000) // Convert to KB approximation

    return NextResponse.json({
      activeConnections: activeConnections.length,
      totalPositions: allPositions.length,
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      dailyPnL: Number(dailyPnL.toFixed(2)),
      totalBalance: Number(totalBalance.toFixed(2)),
      indicationsActive: allIndications.length,
      strategiesActive: allStrategies.length,
      systemLoad: 0, // Would need process metrics
      databaseSize,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] [API] Error fetching monitoring stats:", error)
    return NextResponse.json(
      {
        activeConnections: 0,
        totalPositions: 0,
        dailyPnL: 0,
        totalBalance: 0,
        indicationsActive: 0,
        strategiesActive: 0,
        systemLoad: 0,
        databaseSize: 0,
        error: "Failed to fetch stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
