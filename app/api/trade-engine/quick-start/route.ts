import { NextResponse } from "next/server"
import { getAllConnections, initRedis, updateConnection, setSettings } from "@/lib/redis-db"
import { API_VERSIONS } from "@/lib/system-version"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const API_VERSION = API_VERSIONS.tradeEngine
const LOG_PREFIX = `[v0] [QuickStart] ${API_VERSION}`

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
      const startTime = Date.now()
      console.log(`${LOG_PREFIX}: === QUICKSTART ENABLE FLOW ===`)
      console.log(`${LOG_PREFIX}: Step 1/4: Testing connection ${connection.name}...`)
      
      // Log to engine progression
      await logProgressionEvent(connection.id, "quickstart_started", "info", "QuickStart enable flow initiated", {
        connectionId: connection.id,
        connectionName: connection.name,
        exchange: exchangeName,
      })
      
      // Step 1: Test connection with balance check
      let testPassed = false
      let testError = ""
      let testDuration = 0
      try {
        const testStart = Date.now()
        const testResponse = await fetch(`/api/settings/connections/${connection.id}/test`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
        testDuration = Date.now() - testStart
        const testData = await testResponse.json()
        testPassed = testData.success !== false
        testError = testData.error || testData.details || ""
        console.log(`${LOG_PREFIX}: Step 1/4 COMPLETE: Connection test ${testPassed ? "PASSED" : "FAILED"} (${testDuration}ms)`)
        if (testError) console.log(`${LOG_PREFIX}:   Error: ${testError}`)
        
        await logProgressionEvent(connection.id, "quickstart_test", testPassed ? "info" : "warning", 
          `Connection test ${testPassed ? "passed" : "failed"}`, {
            testPassed,
            testError: testError || undefined,
            duration: testDuration,
          })
      } catch (testErr) {
        console.error(`${LOG_PREFIX}: Step 1/4 ERROR: Connection test exception:`, testErr)
        testError = testErr instanceof Error ? testErr.message : "Unknown error"
        await logProgressionEvent(connection.id, "quickstart_test_error", "error", "Connection test threw exception", {
          error: testError,
        })
      }
      
      // Step 2: Get top 3 symbols by volume
      console.log(`${LOG_PREFIX}: Step 2/4: Retrieving top symbols by volume...`)
      let symbols = body.symbols || ["BTCUSDT", "ETHUSDT", "BNBUSDT"]
      try {
        const symbolsResponse = await fetch(`/api/exchange/${exchangeName}/top-symbols?limit=3`)
        const symbolsData = await symbolsResponse.json()
        if (symbolsData.success && symbolsData.symbols && symbolsData.symbols.length > 0) {
          symbols = symbolsData.symbols
          console.log(`${LOG_PREFIX}: Step 2/4 COMPLETE: Retrieved ${symbols.length} symbols: ${symbols.join(", ")}`)
        } else {
          console.log(`${LOG_PREFIX}: Step 2/4 COMPLETE: Using default symbols: ${symbols.join(", ")}`)
        }
        await logProgressionEvent(connection.id, "quickstart_symbols", "info", "Symbols configured", {
          symbols,
          source: symbolsData.success ? "exchange" : "defaults",
        })
      } catch (symbolErr) {
        console.error(`${LOG_PREFIX}: Step 2/4 WARNING: Failed to retrieve symbols, using defaults:`, symbolErr)
        await logProgressionEvent(connection.id, "quickstart_symbols_fallback", "warning", "Using default symbols", {
          symbols,
          error: symbolErr instanceof Error ? symbolErr.message : String(symbolErr),
        })
      }
      
      // Step 3: Update connection - AUTO ADD TO ACTIVE CONNECTIONS
      console.log(`${LOG_PREFIX}: Step 3/4: Updating connection state...`)
      const enabled = {
        ...connection,
        is_enabled: "1",            // Enable in Settings
        is_enabled_dashboard: "0",  // Dashboard toggle OFF - user must toggle to start
        is_dashboard_inserted: "1", // Inserted for dashboard access
        is_active_inserted: "1",    // AUTO ADD to Active Connections panel
        is_active: "1",             // Mark as active
        is_inserted: "1",           // Mark as inserted
        active_symbols: JSON.stringify(symbols),
        updated_at: new Date().toISOString(),
      }
      await updateConnection(connection.id, enabled)
      console.log(`${LOG_PREFIX}: Step 3/4 COMPLETE: Connection state updated`)
      
      // Step 4: Initialize engine progression state
      console.log(`${LOG_PREFIX}: Step 4/4: Initializing engine progression...`)
      await setSettings(`engine_progression:${connection.id}`, {
        phase: "ready",
        progress: 0,
        detail: "Connection ready. Toggle Enable on dashboard to start processing.",
        updated_at: new Date().toISOString(),
      })
      
      await logProgressionEvent(connection.id, "quickstart_complete", "info", "QuickStart completed successfully", {
        testPassed,
        symbols,
        totalDuration: Date.now() - startTime,
      })
      
      const totalDuration = Date.now() - startTime
      console.log(`${LOG_PREFIX}: === QUICKSTART COMPLETE ===`)
      console.log(`${LOG_PREFIX}: Connection: ${connection.name}`)
      console.log(`${LOG_PREFIX}: Test: ${testPassed ? "PASSED" : "FAILED"}`)
      console.log(`${LOG_PREFIX}: Symbols: ${symbols.join(", ")}`)
      console.log(`${LOG_PREFIX}: Total Duration: ${totalDuration}ms`)
      console.log(`${LOG_PREFIX}: Next Step: Toggle Enable on dashboard to start engine`)
      
      return NextResponse.json({
        success: true,
        action: "enable",
        connection: {
          id: connection.id,
          name: connection.name,
          exchange: connection.exchange,
          is_enabled: "1",
          is_active_inserted: "1",
          testPassed,
          testError: testError || undefined,
        },
        symbols,
        message: `Connection added to Active Connections. Toggle Enable to start processing.`,
        settingsUrl: `/settings?tab=connections&id=${connection.id}`,
        duration: totalDuration,
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
