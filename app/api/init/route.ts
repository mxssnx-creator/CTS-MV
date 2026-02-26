import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/init
 * No longer needed -- all initialization runs via instrumentation.ts -> pre-startup.ts
 * Kept as a status endpoint for backward compatibility.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "System initialization is handled automatically at startup via instrumentation.ts. No manual init needed.",
    note: "Use /api/trade-engine/status to check engine state, /api/trade-engine/start to start the global coordinator.",
  })
}
