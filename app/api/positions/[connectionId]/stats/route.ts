import { NextResponse } from "next/server"
import DatabaseManager from "@/lib/database"

export async function GET(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await params
    const db = DatabaseManager.getInstance()

    // Get position statistics for specific connection
    const stats: any = await db.getPositionStats(connectionId)

    return NextResponse.json({
      stats: {
        total_positions: stats?.total_positions || 0,
        active_positions: stats?.active_positions || 0,
        closed_positions: stats?.closed_positions || 0,
        total_pnl: stats?.total_pnl || 0,
        win_rate: stats?.win_rate || 0,
        avg_profit: stats?.avg_profit || 0,
        avg_loss: stats?.avg_loss || 0,
      },
    })
  } catch (error) {
    console.error("[v0] Failed to fetch connection position stats:", error)
    return NextResponse.json({ error: "Failed to fetch position stats" }, { status: 500 })
  }
}
