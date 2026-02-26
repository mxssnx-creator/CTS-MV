import { NextResponse } from "next/server"
import { initializeTradeEngineAutoStart } from "@/lib/trade-engine-auto-start"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { seedDefaultPresetTypes } from "@/lib/preset-types-seed"
import { initRedis, getAllConnections, createConnection, updateConnection } from "@/lib/redis-db"
import { initializeConsoleLogger } from "@/lib/console-logger"
import { CONNECTION_PREDEFINITIONS } from "@/lib/connection-predefinitions"
import { runMigrations } from "@/lib/redis-migrations"

// Initialize console logger on server startup
initializeConsoleLogger()

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
    
    // Define which predefined exchanges should be auto-inserted by default on dashboard
    // Only bybit and bingx are inserted by default - others can be added manually
    const AUTO_INSERT_EXCHANGES = ["bybit", "bingx"]
    
    // Seed all predefined connections if they don't exist
    const createdConnections = []
    
    for (const predefined of CONNECTION_PREDEFINITIONS) {
      const exists = connections.some(c => c.id === predefined.id)
      const shouldAutoInsert = AUTO_INSERT_EXCHANGES.includes(predefined.exchange)
      
      // Only auto-insert bybit and bingx; others are templates
      if (!exists && shouldAutoInsert) {
        try {
          console.log(`[v0] [Init] Auto-inserting connection: ${predefined.name} (${predefined.id})`)
          
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
            is_inserted: "1", // Mark as inserted for dashboard display
            is_enabled: "1", // Base connections always enabled in Settings
            is_enabled_dashboard: "0", // But not active until user activates them
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
          
          console.log(`[v0] [Init] Auto-inserted: ${predefined.name}`)
        } catch (error) {
          console.error(`[v0] [Init] Failed to insert ${predefined.id}:`, error)
        }
      } else if (!exists && !shouldAutoInsert) {
        // Create template connections for other exchanges (not inserted, just informational)
        try {
          console.log(`[v0] [Init] Creating template (not inserted): ${predefined.name}`)
          await createConnection({
            id: predefined.id,
            name: predefined.name,
            exchange: predefined.exchange,
            api_type: predefined.apiType,
            connection_method: predefined.connectionMethod,
            connection_library: predefined.connectionLibrary,
            margin_type: predefined.marginType,
            position_mode: predefined.positionMode,
            is_testnet: false,
            is_inserted: "0", // Not inserted, template only
            is_enabled: "1", // Will be enabled when needed
            is_enabled_dashboard: "0",
            is_predefined: true,
            api_key: predefined.apiKey || "",
            api_secret: predefined.apiSecret || "",
          })
        } catch (error) {
          console.error(`[v0] [Init] Failed to create template ${predefined.id}:`, error)
        }
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
