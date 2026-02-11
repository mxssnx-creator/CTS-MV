import { NextResponse } from "next/server"
import { ConnectionLogger } from "@/lib/connection-logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: { connectionId: string } }) {
  try {
    const connectionId = params.connectionId
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get("limit") || "50")

    const logs = ConnectionLogger.getLogs(connectionId, limit)
    const errors = ConnectionLogger.getErrors(connectionId)
    const warnings = ConnectionLogger.getWarnings(connectionId)

    return NextResponse.json({
      connectionId,
      logs,
      errors,
      warnings,
      totalLogs: logs.length,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Failed to fetch connection logs:", errorMsg)

    return NextResponse.json(
      { error: "Failed to fetch logs", details: errorMsg },
      { status: 500 }
    )
  }
}
