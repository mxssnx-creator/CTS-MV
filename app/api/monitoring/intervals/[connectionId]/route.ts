import { NextResponse } from "next/server"
import { globalIntervalManager } from "@/lib/interval-progression-manager"

export async function GET(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await params

    if (!connectionId) {
      return NextResponse.json({ success: false, error: "Connection ID required" }, { status: 400 })
    }

    const intervals = await globalIntervalManager.getIntervalHealth(connectionId)

    return NextResponse.json({
      success: true,
      intervals,
    })
  } catch (error) {
    console.error("[v0] Error fetching interval health:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch interval health" },
      { status: 500 }
    )
  }
}
