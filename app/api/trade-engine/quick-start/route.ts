import { NextResponse } from "next/server"
import { getAllConnections, initRedis, updateConnection } from "@/lib/redis-db"
import { API_VERSIONS } from "@/lib/system-version"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const API_VERSION = API_VERSIONS.tradeEngine

/**
 * POST /api/trade-engine/quick-start
 * Quick-start endpoint: enables BingX connection (or bybit as fallback) on dashboard
 * Accepts optional symbols parameter to limit to specific symbols (default: 3)
 * BingX is preferred as it has proven API key validation in production
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || "enable"
    const symbols = body.symbols || ["BTCUSDT", "ETHUSDT", "BNBUSDT"] // Default: 3 symbols
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: Action=${action}, Symbols=${symbols.length} (${symbols.join(", ")})`)
    
    await initRedis()
    const allConnections = await getAllConnections()
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: Checking ${allConnections.length} connections`)
    for (const c of allConnections) {
      const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
      console.log(`  - ${c.name} (${c.id}): predefined=${isPredefined}, exchange=${c.exchange}`)
    }
    
    // Find user-created BingX/Bybit FIRST (preferred), fallback to predefined
    let connection = allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
      return exch === "bingx" && !isPredefined  // User-created BingX
    }) || allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
      return exch === "bybit" && !isPredefined  // User-created Bybit
    }) || allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      return exch === "bingx"  // Any BingX (including predefined template)
    }) || allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      return exch === "bybit"  // Any Bybit (including predefined template)
    })
    
    if (!connection) {
      console.log(`[v0] [QuickStart] ${API_VERSION}: ✗ No BingX/Bybit connections found at all`)
      return NextResponse.json(
        { 
          success: false,
          error: "No BingX/Bybit connections found",
          availableConnections: allConnections.map((c: any) => ({ 
            name: c.name,
            id: c.id,
            exchange: c.exchange,
            isPredefined: c.is_predefined
          }))
        },
        { status: 404 }
      )
    }
    
    const isPredefinedConnection = connection.is_predefined === true || connection.is_predefined === "1" || connection.is_predefined === "true"
    const connType = isPredefinedConnection ? "[PREDEFINED TEMPLATE]" : "[USER-CREATED]"
    console.log(`[v0] [QuickStart] ${API_VERSION}: Found ${connection.name} (${connection.id}) ${connType}`)
    
    if (action === "disable") {
      // DISABLE: Clear both dashboard fields
      console.log(`[v0] [QuickStart] ${API_VERSION}: Disabling ${connection.name}...`)
      const disabled = {
        ...connection,
        is_dashboard_inserted: "0",
        is_enabled_dashboard: "0",
        updated_at: new Date().toISOString(),
      }
      await updateConnection(connection.id, disabled)
      console.log(`[v0] [QuickStart] ${API_VERSION}: ✓ Disabled ${connection.name}`)
      return NextResponse.json({
        success: true,
        action: "disable",
        connection: {
          id: connection.id,
          name: connection.name,
          exchange: connection.exchange,
        },
        version: API_VERSION,
      })
    } else {
      // ENABLE: Set all required flags so live-trade prerequisite checks pass
      console.log(`[v0] [QuickStart] ${API_VERSION}: Enabling ${connection.name} with ${symbols.length} symbols: ${symbols.join(", ")}`)
      const enabled = {
        ...connection,
        is_enabled: "1",            // live-trade route checks this: "Connection must be enabled in Settings"
        is_enabled_dashboard: "1",  // live-trade route checks this: "Connection must be added to Active Connections"
        is_dashboard_inserted: "1", // legacy field used by some queries
        is_active_inserted: "1",    // active panel flag
        is_active: "1",             // general active flag
        active_symbols: JSON.stringify(symbols),
        updated_at: new Date().toISOString(),
      }
      await updateConnection(connection.id, enabled)
      console.log(`[v0] [QuickStart] ${API_VERSION}: ✓ Enabled ${connection.name}`)
      console.log(`[v0] [QuickStart] ${API_VERSION}: is_enabled=1 is_enabled_dashboard=1 is_active_inserted=1 is_active=1`)
      console.log(`[v0] [QuickStart] ${API_VERSION}: Symbols: ${symbols.join(", ")}`)
      return NextResponse.json({
        success: true,
        action: "enable",
        connection: {
          id: connection.id,
          name: connection.name,
          exchange: connection.exchange,
          is_enabled: "1",
          is_enabled_dashboard: "1",
          active_symbols: symbols,
        },
        version: API_VERSION,
      })
    }
  } catch (error) {
    console.error(`[v0] [QuickStart] ${API_VERSION}: Error:`, error)
    return NextResponse.json(
      { error: "Quick start failed", details: error instanceof Error ? error.message : "Unknown error", version: API_VERSION },
      { status: 500 }
    )
  }
}
