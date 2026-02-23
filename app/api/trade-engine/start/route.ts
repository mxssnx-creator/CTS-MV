import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { SystemLogger } from "@/lib/system-logger"

export const dynamic = "force-dynamic"

/**
 * POST /api/trade-engine/start
 * Start the Global Trade Engine Coordinator (independent of any connections)
 * 
 * The Global Coordinator is the overall control system.
 * Individual connection engines (Main and Preset) are controlled separately via:
 * - /api/settings/connections/[id]/live-trade (Main Engine)
 * - /api/settings/connections/[id]/preset-toggle (Preset Engine)
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[v0] [Trade Engine] Starting Global Trade Engine Coordinator (independent of connections)")
    await SystemLogger.logTradeEngine(`Starting Global Coordinator`, "info")

    const coordinator = getGlobalTradeEngineCoordinator()
    
    if (!coordinator) {
      return NextResponse.json({ error: "Coordinator not initialized" }, { status: 503 })
    }

    // Initialize Redis
    await initRedis()
    const client = getRedisClient()
    
    // Set global state in Redis
    await client.hset("trade_engine:global", { 
      status: "running", 
      started_at: new Date().toISOString(),
      coordinator_ready: "true"
    })
    
    // Force immediate persistence so status endpoint sees the change
    await client.saveSnapshot()
    
    console.log("[v0] [Trade Engine] Global Coordinator state saved to Redis: status=running")
    console.log("[v0] [Trade Engine] Global Coordinator is running and ready")
    console.log("[v0] [Trade Engine] Connection-specific engines controlled via:")
    console.log("[v0] [Trade Engine]   - Main Engine: POST /api/settings/connections/[id]/live-trade")
    console.log("[v0] [Trade Engine]   - Preset Engine: POST /api/settings/connections/[id]/preset-toggle")

    await SystemLogger.logTradeEngine(`Global Coordinator started and ready`, "info")

    return NextResponse.json({
      success: true,
      message: "Global Trade Engine Coordinator started and ready",
      details: "Connection-specific engines are controlled independently via their toggle endpoints",
      coordinator_status: "running",
    })

  } catch (error) {
    console.error("[v0] Failed to start Global Coordinator:", error)
    await SystemLogger.logError(error, "trade-engine", "POST /api/trade-engine/start")

    return NextResponse.json(
      {
        error: "Failed to start Global Coordinator",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
