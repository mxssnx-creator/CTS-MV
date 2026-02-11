import { NextResponse } from "next/server"
import { getTradeEngine } from "@/lib/trade-engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/trade-engine/pause
 * Pause the Global Trade Engine Coordinator
 * Pauses all trading operations across all connections
 */
export async function POST() {
  try {
    const coordinator = getTradeEngine()

    if (!coordinator) {
      return NextResponse.json({ success: false, error: "Trade engine coordinator not initialized" }, { status: 503 })
    }

    await coordinator.pause()
    console.log("[v0] Global Trade Engine Coordinator paused via API")

    return NextResponse.json({
      success: true,
      message: "Trade engine paused successfully",
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Pause API error:", errorMessage)

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
