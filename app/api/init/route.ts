import { NextResponse } from "next/server"
import { initializeTradeEngineAutoStart } from "@/lib/trade-engine-auto-start"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { seedDefaultPresetTypes } from "@/lib/preset-types-seed"
import { initRedis, getAllConnections, createConnection, updateConnection } from "@/lib/redis-db"
import { CONNECTION_PREDEFINITIONS } from "@/lib/connection-predefinitions"
import { runMigrations } from "@/lib/redis-migrations"

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
    
    // Run all pending migrations FIRST before anything else
    try {
      const migrationResult = await runMigrations()
      console.log(`[v0] [Init] Migrations: ${migrationResult.message} (v${migrationResult.version})`)
    } catch (migrationError) {
      console.error("[v0] [Init] Migration error (non-fatal):", migrationError)
    }
    
    // Seed default preset types
    await seedDefaultPresetTypes()
    console.log("[v0] [Init] Preset types seeded")
    
    // Get existing connections
    const connections = await getAllConnections()
    console.log("[v0] [Init] Found", connections.length, "existing connections")
    
    // Define which predefined exchanges should be auto-created and enabled by default
    const AUTO_CREATE_EXCHANGES = ["bybit", "bingx", "pionex", "orangex"]
    
    // Seed all predefined connections if they don't exist
    const createdConnections = []
    
    for (const predefined of CONNECTION_PREDEFINITIONS) {
      const exists = connections.some(c => c.id === predefined.id)
      const shouldAutoCreate = AUTO_CREATE_EXCHANGES.includes(predefined.exchange)
      
      // Only auto-create the 4 primary exchanges; others are informational templates
      if (!exists && shouldAutoCreate) {
        try {
          console.log(`[v0] [Init] Auto-creating enabled connection: ${predefined.name} (${predefined.id})`)
          
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
            is_enabled: true, // These 4 are enabled by default
            is_enabled_dashboard: "0", // But not active until user adds them
            is_predefined: true,
            api_key: predefined.apiKey || "",
            api_secret: predefined.apiSecret || "",
          })
          
          createdConnections.push({
            id: connectionId,
            name: predefined.name,
            exchange: predefined.exchange,
            autoCreated: true
          })
          
          console.log(`[v0] [Init] Auto-created and enabled: ${predefined.name}`)
        } catch (error) {
          console.error(`[v0] [Init] Failed to create predefined connection ${predefined.id}:`, error)
        }
      } else if (!exists && !shouldAutoCreate) {
        console.log(`[v0] [Init] Skipping non-primary exchange: ${predefined.name} (available as template only)`)
      }
    }
    
    console.log(`[v0] [Init] Created ${createdConnections.length} new predefined connections`)
    
    // Force-enable ALL base connections (they must always be enabled)
    const allConns = await getAllConnections()
    let forceEnabledCount = 0
    for (const conn of allConns) {
      const exchange = (conn.exchange || "").toLowerCase().trim()
      const isBase = AUTO_CREATE_EXCHANGES.includes(exchange)
      if (isBase) {
        const isCurrentlyEnabled = conn.is_enabled === true || conn.is_enabled === "1" || conn.is_enabled === "true"
        if (!isCurrentlyEnabled) {
          await updateConnection(conn.id, {
            ...conn,
            is_enabled: "1",
            updated_at: new Date().toISOString(),
          })
          forceEnabledCount++
          console.log(`[v0] [Init] Force-enabled base connection: ${conn.name} (${conn.id})`)
        }
      }
    }
    if (forceEnabledCount > 0) {
      console.log(`[v0] [Init] Force-enabled ${forceEnabledCount} base connections`)
    }
    
    // Trigger initial auto-test for all base connections (non-blocking)
    fetch(new URL("/api/settings/connections/auto-test", process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000").toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "init" }),
    }).catch(() => {
      // Non-blocking: auto-test will run on next scheduled interval if this fails
    })
    
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
      forceEnabled: forceEnabledCount,
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
