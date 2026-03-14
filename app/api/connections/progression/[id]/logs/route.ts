import { NextResponse } from "next/server"
import { getProgressionLogs } from "@/lib/engine-progression-logs"
import { initRedis } from "@/lib/redis-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await initRedis()
    const connectionId = params.id

    if (!connectionId) {
      return NextResponse.json({ error: "Connection ID required" }, { status: 400 })
    }

    // Get progression logs for this connection
    const logs = await getProgressionLogs(connectionId)

    return NextResponse.json({
      success: true,
      connectionId,
      logsCount: logs.length,
      logs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error fetching progression logs:", error)
    return NextResponse.json(
      { error: "Failed to fetch progression logs", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
