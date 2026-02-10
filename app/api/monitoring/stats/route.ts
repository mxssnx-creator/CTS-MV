import { NextResponse } from "next/server"
import { initRedis, getAllConnections } from "@/lib/redis-db"
import DatabaseManager from "@/lib/database"

export async function GET() {
  try {
    await initRedis()
    const db = DatabaseManager.getInstance()
    
    // Get connections
    const connections = await getAllConnections()
    const activeConnections = connections.filter((c: any) => c.is_enabled).length
    
    // Get positions
    let totalPositions = 0
    try {
      const pseudoPositions = await db.getPseudoPositions(undefined, 100)
      const realPositions = await db.getRealPositions()
      totalPositions = pseudoPositions.length + realPositions.length
    } catch (error) {
      console.warn("[v0] Failed to get positions:", error)
    }
    
    // Calculate mock stats (in production, these would be real calculations)
    const dailyPnL = Math.random() * 1000 - 500
    const totalBalance = 10000 + dailyPnL
    const indicationsActive = 15
    const strategiesActive = 8
    const systemLoad = Math.floor(Math.random() * 30) + 40
    const databaseSize = Math.floor(Math.random() * 50) + 100

    return NextResponse.json({
      activeConnections,
      totalPositions,
      dailyPnL: Number(dailyPnL.toFixed(2)),
      totalBalance: Number(totalBalance.toFixed(2)),
      indicationsActive,
      strategiesActive,
      systemLoad,
      databaseSize,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error fetching monitoring stats:", error)
    return NextResponse.json(
      {
        activeConnections: 0,
        totalPositions: 0,
        dailyPnL: 0,
        totalBalance: 0,
        indicationsActive: 0,
        strategiesActive: 0,
        systemLoad: 45,
        databaseSize: 128,
        error: "Failed to fetch stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
