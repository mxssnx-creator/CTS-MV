import { NextResponse } from "next/server"
import { getAllConnections, initRedis, updateConnection } from "@/lib/redis-db"
import { API_VERSIONS } from "@/lib/system-version"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const API_VERSION = API_VERSIONS.tradeEngine

/**
 * POST /api/trade-engine/quick-start
 * Quick-start endpoint: enables BingX connection (or bybit as fallback) on dashboard
 * Useful for testing when no connections are actively enabled
 * BingX is preferred as it has proven API key validation in production
 */
export async function POST() {
  try {
    console.log(`[v0] [QuickStart] ${API_VERSION}: Attempting to enable BingX connection for quick start...`)
    
    await initRedis()
    const allConnections = await getAllConnections()
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: Checking ${allConnections.length} connections`)
    
    // Find ANY BingX connection first (regardless of dashboard status), fallback to bybit
    // Quick-start will INSERT it to dashboard AND enable it
    const connection = allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      return exch === "bingx"
    }) || allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      return exch === "bybit"
    })
    
    if (!connection) {
      console.log(`[v0] [QuickStart] ${API_VERSION}: ✗ No BingX/Bybit connections found at all`)
      return NextResponse.json(
        { 
          success: false,
          error: "No BingX/Bybit connections found",
          message: "Add a BingX or Bybit connection from Settings first",
          availableConnections: allConnections.map((c: any) => ({ 
            name: c.name, 
            exchange: c.exchange, 
            dashboard_inserted: c.is_dashboard_inserted 
          }))
        },
        { status: 404 }
      )
    }
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: Found ${connection.name} (${connection.exchange})`)
    
    // CRITICAL: Set BOTH is_dashboard_inserted AND is_enabled_dashboard
    // This ensures the connection appears on dashboard AND is active
    const updated = {
      ...connection,
      is_dashboard_inserted: "1",   // Show on dashboard
      is_enabled_dashboard: "1",    // Enable for trading
      updated_at: new Date().toISOString(),
    }
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: Setting is_dashboard_inserted=1 AND is_enabled_dashboard=1`)
    
    await updateConnection(connection.id, updated)
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: ✓ Enabled ${connection.name} (${connection.exchange}) on dashboard`)
    console.log(`[v0] [QuickStart] ${API_VERSION}: Trade engine should auto-detect and start with this connection`)
    
    return NextResponse.json({
      success: true,
      message: `Enabled ${connection.name} (${connection.exchange}). Trade engine will auto-start with this connection.`,
      connection: {
        id: connection.id,
        name: connection.name,
        exchange: connection.exchange,
        is_enabled_dashboard: "1",
      },
      version: API_VERSION,
    })
  } catch (error) {
    console.error(`[v0] [QuickStart] ${API_VERSION}: Error:`, error)
    return NextResponse.json(
      { error: "Quick start failed", details: error instanceof Error ? error.message : "Unknown error", version: API_VERSION },
      { status: 500 }
    )
  }
}
