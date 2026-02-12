import { NextResponse } from "next/server"
import { initializeTradeEngineAutoStart } from "@/lib/trade-engine-auto-start"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { seedDefaultPresetTypes } from "@/lib/preset-types-seed"
import { initRedis, getAllConnections, createConnection } from "@/lib/redis-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/init
 * Initialize trade engine, system services, and default data on startup
 */
export async function GET() {
  try {
    console.log("[v0] [Init] Initializing all systems...")
    
    // Initialize Redis connection
    await initRedis()
    console.log("[v0] [Init] Redis initialized")
    
    // Seed default preset types
    await seedDefaultPresetTypes()
    console.log("[v0] [Init] Preset types seeded")
    
    // Create default connections if they don't exist
    const connections = await getAllConnections()
    console.log("[v0] [Init] Found", connections.length, "existing connections")
    
    const bybitExists = connections.some(c => c.exchange === "bybit")
    const bingxExists = connections.some(c => c.exchange === "bingx")
    
    const createdConnections = []
    
    if (!bybitExists) {
      console.log("[v0] [Init] Creating default Bybit connection...")
      try {
        const bybitId = await createConnection({
          name: "Bybit (Default)",
          exchange: "bybit",
          api_type: "public_private",
          connection_method: "rest",
          connection_library: "native",
          margin_type: "cross",
          position_mode: "hedge",
          is_testnet: false,
          is_enabled: false,
          is_active: false,
          volume_factor: 1.0,
        })
        createdConnections.push({ id: bybitId, exchange: "bybit", name: "Bybit (Default)" })
        console.log("[v0] [Init] Created Bybit connection:", bybitId)
      } catch (error) {
        console.warn("[v0] [Init] Failed to create Bybit connection:", error)
      }
    }
    
    if (!bingxExists) {
      console.log("[v0] [Init] Creating default BingX connection...")
      try {
        const bingxId = await createConnection({
          name: "BingX (Default)",
          exchange: "bingx",
          api_type: "public_private",
          connection_method: "rest",
          connection_library: "native",
          margin_type: "cross",
          position_mode: "one-way",
          is_testnet: false,
          is_enabled: false,
          is_active: false,
          volume_factor: 1.0,
        })
        createdConnections.push({ id: bingxId, exchange: "bingx", name: "BingX (Default)" })
        console.log("[v0] [Init] Created BingX connection:", bingxId)
      } catch (error) {
        console.warn("[v0] [Init] Failed to create BingX connection:", error)
      }
    }
    
    // Ensure global coordinator is initialized
    const coordinator = getGlobalTradeEngineCoordinator()
    console.log("[v0] [Init] Global trade engine coordinator ensured")
    
    // Start auto-initialization of trade engines
    await initializeTradeEngineAutoStart()
    console.log("[v0] [Init] Trade engine auto-start initialized")
    
    const finalConnections = await getAllConnections()
    
    console.log("[v0] [Init] All systems initialized successfully - Total connections:", finalConnections.length)
    
    return NextResponse.json({ 
      success: true, 
      message: "System initialization complete",
      coordinator: "ready",
      presets: "seeded",
      defaultConnectionsCreated: createdConnections.length,
      totalConnections: finalConnections.length,
      createdConnections: createdConnections,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] [Init] Failed to initialize:", errorMsg)
    
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    )
  }
}
