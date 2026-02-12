import { NextResponse, type NextRequest } from "next/server"
import { initRedis } from "@/lib/redis-db"
import { RedisLogs } from "@/lib/redis-operations"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: connectionId } = await params
    await initRedis()
    
    const logs = await RedisLogs.getLogsByConnection(connectionId)
    
    return NextResponse.json({
      connectionId,
      logs,
      total: logs.length,
    })
  } catch (error) {
    console.error("[v0] Failed to get connection logs:", error)
    return NextResponse.json(
      { error: "Failed to get logs", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
