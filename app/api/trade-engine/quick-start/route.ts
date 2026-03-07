import { NextResponse } from "next/server"
import { getAllConnections, initRedis, updateConnection } from "@/lib/redis-db"
import { API_VERSIONS } from "@/lib/system-version"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const API_VERSION = API_VERSIONS.tradeEngine

/**
 * POST /api/trade-engine/quick-start
 * Quick-start endpoint with enhanced features:
 * 1. Tests connection with balance check
 * 2. Auto-retrieves top 3 symbols by 24h volume
 * 3. Sets up connection with these symbols as defaults
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || "enable"
    
    await initRedis()
    const allConnections = await getAllConnections()
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: Action=${action}, Checking ${allConnections.length} connections`)
    
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
      console.log(`[v0] [QuickStart] ${API_VERSION}: ✗ No BingX/Bybit connections found`)
      return NextResponse.json(
        { 
          success: false,
          error: "No BingX/Bybit connections found",
          availableConnections: allConnections.map((c: any) => ({ 
            name: c.name,
            id: c.id,
            exchange: c.exchange,
          }))
        },
        { status: 404 }
      )
    }
    
    const exchangeName = (connection.exchange || "").toLowerCase()
    console.log(`[v0] [QuickStart] ${API_VERSION}: Found ${connection.name} (${connection.id}) on ${exchangeName}`)
    
    if (action === "disable") {
      // DISABLE: Clear dashboard fields
      console.log(`[v0] [QuickStart] ${API_VERSION}: Disabling ${connection.name}...`)
      const disabled = {
        ...connection,
        is_dashboard_inserted: "0",
        is_enabled_dashboard: "0",
        is_enabled: "0",
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
      // ENABLE: Test connection and auto-retrieve top symbols
      console.log(`[v0] [QuickStart] ${API_VERSION}: Testing connection ${connection.name}...`)
      
      // Step 1: Test connection with balance check
      let testPassed = false
      let testError = ""
      try {
        const testResponse = await fetch(`/api/settings/connections/${connection.id}/test`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
        const testData = await testResponse.json()
        testPassed = testData.success !== false
        testError = testData.error || testData.details || ""
        console.log(`[v0] [QuickStart] ${API_VERSION}: Connection test ${testPassed ? "✓ passed" : "✗ failed"}: ${testError}`)
      } catch (testErr) {
        console.error(`[v0] [QuickStart] ${API_VERSION}: Connection test error:`, testErr)
        testError = testErr instanceof Error ? testErr.message : "Unknown error"
      }
      
      // Step 2: Get top 3 symbols by volume
      let symbols = body.symbols || ["BTCUSDT", "ETHUSDT", "BNBUSDT"] // Fallback defaults
      try {
        const symbolsResponse = await fetch(`/api/exchange/${exchangeName}/top-symbols?limit=3`)
        const symbolsData = await symbolsResponse.json()
        if (symbolsData.success && symbolsData.symbols && symbolsData.symbols.length > 0) {
          symbols = symbolsData.symbols
          console.log(`[v0] [QuickStart] ${API_VERSION}: ✓ Retrieved top 3 symbols: ${symbols.join(", ")}`)
        }
      } catch (symbolErr) {
        console.error(`[v0] [QuickStart] ${API_VERSION}: Failed to retrieve symbols:`, symbolErr)
      }
      
      // Step 3: Update connection with defaults
      console.log(`[v0] [QuickStart] ${API_VERSION}: Enabling ${connection.name} with ${symbols.length} symbols: ${symbols.join(", ")}`)
      const enabled = {
        ...connection,
        is_enabled: "1",            // Enable in Settings
        is_enabled_dashboard: "0",  // NOT enabled by default - user must toggle
        is_dashboard_inserted: "1", // Inserted for dashboard access
        is_active_inserted: "0",    // NOT in Active panel by default
        is_active: "0",             // Not actively processing until user enables
        active_symbols: JSON.stringify(symbols),
        updated_at: new Date().toISOString(),
      }
      await updateConnection(connection.id, enabled)
      console.log(`[v0] [QuickStart] ${API_VERSION}: ✓ Updated ${connection.name}`)
      console.log(`[v0] [QuickStart] ${API_VERSION}: Connection tested, symbols set to: ${symbols.join(", ")}`)
      console.log(`[v0] [QuickStart] ${API_VERSION}: User must toggle Enable to start processing`)
      
      return NextResponse.json({
        success: true,
        action: "enable",
        connection: {
          id: connection.id,
          name: connection.name,
          exchange: connection.exchange,
          is_enabled: "1",
          testPassed,
          testError: testError || undefined,
          defaultSymbols: symbols,
        },
        message: `Connection tested and configured with ${symbols.length} default symbols. Toggle Enable to start processing.`,
        settingsUrl: `/settings?tab=connections&id=${connection.id}`,
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
