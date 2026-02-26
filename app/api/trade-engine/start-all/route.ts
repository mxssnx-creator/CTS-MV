import { NextResponse } from "next/server"

/**
 * GET /api/trade-engine/start-all
 * Deprecated -- use POST /api/trade-engine/start instead.
 * The global start route already auto-resumes all paused connections.
 */
export async function GET() {
  return NextResponse.json({
    success: false,
    message: "Deprecated: Use POST /api/trade-engine/start instead. It starts the global coordinator and auto-resumes all paused connections.",
    redirect: "/api/trade-engine/start",
  }, { status: 410 })
}
