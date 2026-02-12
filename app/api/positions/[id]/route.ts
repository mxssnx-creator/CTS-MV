import { NextResponse, type NextRequest } from "next/server"
import { initRedis } from "@/lib/redis-db"
import { RedisPositions } from "@/lib/redis-operations"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: connectionId } = await params

    await initRedis()
    const positions = await RedisPositions.getPositionsByConnection(connectionId)
    const openPositions = positions.filter((p: any) => p.status !== "closed")

    return NextResponse.json({
      connectionId,
      positions,
      openPositions,
      total: positions.length,
      open: openPositions.length,
    })
  } catch (error) {
    console.error("[v0] Failed to get positions:", error)
    return NextResponse.json(
      { error: "Failed to get positions", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
