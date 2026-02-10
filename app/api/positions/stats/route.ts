import { NextResponse } from "next/server"
import DatabaseManager from "@/lib/database"

export async function GET() {
  try {
    const db = DatabaseManager.getInstance()
    // Get position statistics
    const stats: any = await db.getGlobalPositionStats() // Use the new getGlobalPositionStats method instead of direct db.prepare

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
    console.error("[v0] Failed to fetch position stats:", error)
    return NextResponse.json({ error: "Failed to fetch position stats" }, { status: 500 })
  }
}
