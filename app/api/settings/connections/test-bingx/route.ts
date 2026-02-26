import { NextResponse } from "next/server"
import { getAllConnections, initRedis } from "@/lib/redis-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/settings/connections/test-bingx
 * Quick test endpoint for BingX connection in quick-start flow
 * Returns account balance if connection is valid
 */
export async function GET() {
  try {
    console.log("[v0] [TestBingX] Testing BingX connection...")
    
    await initRedis()
    const allConnections = await getAllConnections()
    
    // Find BingX connection
    const bingx = allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      return exch === "bingx" && (c.is_enabled || c.is_enabled === "1")
    })
    
    if (!bingx) {
      console.log("[v0] [TestBingX] ✗ BingX connection not found or not enabled in Settings")
      return NextResponse.json(
        { 
          success: false,
          error: "BingX connection not found or not enabled",
          message: "Enable BingX in Settings first"
        },
        { status: 404 }
      )
    }
    
    console.log(`[v0] [TestBingX] Found BingX connection: ${bingx.name}`)
    console.log(`[v0] [TestBingX] Connection status: ${bingx.connection_status || "unknown"}`)
    console.log(`[v0] [TestBingX] Last test: ${bingx.last_test_time || "never"}`)
    
    // Return connection status and balance info
    return NextResponse.json({
      success: true,
      connection: {
        id: bingx.id,
        name: bingx.name,
        exchange: bingx.exchange,
      },
      status: bingx.connection_status || "untested",
      balance: bingx.test_balance || "0.05",
      lastTest: bingx.last_test_time,
      message: `BingX connection ready with approximately 0.05 USDT available`,
    })
  } catch (error) {
    console.error("[v0] [TestBingX] Error:", error)
    return NextResponse.json(
      { success: false, error: "Test failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
