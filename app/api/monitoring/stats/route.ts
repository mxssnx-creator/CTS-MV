import { NextResponse, type NextRequest } from "next/server"
import { initRedis, getAllConnections, getRedisClient } from "@/lib/redis-db"
import { RedisBulkOps, RedisPositions, RedisTrades } from "@/lib/redis-operations"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const exchangeFilter = searchParams.get("exchange")
    
    await initRedis()
    const client = getRedisClient()

    // Get all connections, optionally filtered by exchange
    let connections = await getAllConnections()
    if (exchangeFilter) {
      connections = connections.filter((c: any) => c.exchange === exchangeFilter)
    }
    const activeConnections = connections.filter((c: any) => c.is_active === true || c.is_active === "true")
    
    // Get positions and trades for all connections
    let totalPositions = 0
    let openPositions = 0
    let totalTrades = 0
    let dailyPnL = 0
    let unrealizedPnL = 0
    
    for (const conn of connections) {
      const positions = await RedisPositions.getPositionsByConnection(conn.id)
      const trades = await RedisTrades.getTradesByConnection(conn.id)
      
      totalPositions += positions.length
      totalTrades += trades.length
      
      const open = positions.filter((p: any) => p.status !== "closed" && p.status !== "CLOSED")
      openPositions += open.length
      
      // Calculate P&L
      positions.forEach((pos: any) => {
        if (pos.status === "closed" || pos.status === "CLOSED") {
          dailyPnL += parseFloat(pos.realized_pnl || "0")
        } else {
          unrealizedPnL += parseFloat(pos.unrealized_pnl || "0")
        }
      })
    }

    // Get database statistics
    const stats = await RedisBulkOps.getStatistics()

    // Get system metrics
    const systemLoad = Math.round(Math.random() * 100) // Placeholder
    const databaseSize = (stats.connections || 0) * 10 // Rough estimate

    return NextResponse.json({
      activeConnections: activeConnections.length,
      totalConnections: connections.length,
      totalPositions,
      openPositions,
      totalTrades,
      dailyPnL: Number(dailyPnL.toFixed(2)),
      unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
      totalBalance: Number((dailyPnL + unrealizedPnL).toFixed(2)),
      systemLoad,
      databaseSize,
      statistics: stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] [API] Error fetching monitoring stats:", error)
    return NextResponse.json(
      {
        activeConnections: 0,
        totalConnections: 0,
        totalPositions: 0,
        openPositions: 0,
        totalTrades: 0,
        dailyPnL: 0,
        unrealizedPnL: 0,
        totalBalance: 0,
        systemLoad: 0,
        databaseSize: 0,
        error: "Failed to fetch stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
