import { NextResponse } from "next/server"
import { globalIntervalManager } from "@/lib/interval-progression-manager"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ success: false, error: "Connection ID required" }, { status: 400 })
    }

    const intervals = await globalIntervalManager.getIntervalHealth(id)

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
