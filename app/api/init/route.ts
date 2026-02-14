import { NextResponse } from "next/server"
import { initializeTradeEngineAutoStart } from "@/lib/trade-engine-auto-start"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { seedDefaultPresetTypes } from "@/lib/preset-types-seed"
import { initRedis, getAllConnections, createConnection } from "@/lib/redis-db"
import { CONNECTION_PREDEFINITIONS } from "@/lib/connection-predefinitions"

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
    
    // Get existing connections
    const connections = await getAllConnections()
    console.log("[v0] [Init] Found", connections.length, "existing connections")
    
    // Seed all predefined connections if they don't exist
    const createdConnections = []
    
    for (const predefined of CONNECTION_PREDEFINITIONS) {
      const exists = connections.some(c => c.id === predefined.id)
      
      if (!exists) {
        try {
          console.log(`[v0] [Init] Creating predefined connection: ${predefined.name} (${predefined.id})`)
          
          const connectionId = await createConnection({
            id: predefined.id,
            name: predefined.name,
            exchange: predefined.exchange,
            api_type: predefined.apiType,
            connection_method: predefined.connectionMethod,
            connection_library: predefined.connectionLibrary,
            margin_type: predefined.marginType,
            position_mode: predefined.positionMode,
            is_testnet: false,
            is_enabled: true,
            is_predefined: true,
            api_key: predefined.apiKey || "",
            api_secret: predefined.apiSecret || "",
          })
          
          createdConnections.push({
            id: connectionId,
            name: predefined.name,
            exchange: predefined.exchange
          })
          
          console.log(`[v0] [Init] Created: ${predefined.name}`)
        } catch (error) {
          console.error(`[v0] [Init] Failed to create predefined connection ${predefined.id}:`, error)
        }
      }
    }
    
    console.log(`[v0] [Init] Created ${createdConnections.length} new predefined connections`)
    
    // Initialize trade engine auto-start
    try {
      await initializeTradeEngineAutoStart()
      console.log("[v0] [Init] Trade engine auto-start initialized")
    } catch (error) {
      console.warn("[v0] [Init] Failed to initialize trade engine auto-start:", error)
    }
    
    return NextResponse.json({
      success: true,
      message: "System initialized",
      connectionsCreated: createdConnections.length,
      totalConnections: connections.length + createdConnections.length,
    })
  } catch (error) {
    console.error("[v0] [Init] Initialization error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Initialization failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
