import { NextResponse } from "next/server"
import { getAllConnections, initRedis, updateConnection, setSettings, getRedisClient } from "@/lib/redis-db"
import { API_VERSIONS } from "@/lib/system-version"
import { logProgressionEvent, getProgressionLogs } from "@/lib/engine-progression-logs"
import { createExchangeConnector } from "@/lib/exchange-connectors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const API_VERSION = API_VERSIONS.tradeEngine
const LOG_PREFIX = `[v0] [QuickStart] ${API_VERSION}`

// Default trading symbols for major exchanges
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]

/**
 * POST /api/trade-engine/quick-start
 * Quick-start endpoint with direct function calls (no HTTP fetch):
 * 1. Tests connection using createExchangeConnector directly
 * 2. Auto-retrieves top symbols or uses defaults
 * 3. Sets up connection with these symbols
 * 4. Logs all progression events
 */
export async function POST(request: Request) {
  const startTime = Date.now()
  
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || "enable"
    
    await initRedis()
    const allConnections = await getAllConnections()
    
    console.log(`${LOG_PREFIX}: === QUICKSTART ${action.toUpperCase()} ===`)
    console.log(`${LOG_PREFIX}: Scanning ${allConnections.length} connections...`)
    
    // Log initial progress
    await logProgressionEvent("global", "quickstart_scan", "info", `Scanning ${allConnections.length} connections`, {
      action,
      totalConnections: allConnections.length,
      timestamp: new Date().toISOString(),
    })
    
    // Find connections with credentials OR any base connection for setup
    let connection = allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
      const hasCredentials = !!(c.api_key && c.api_secret && c.api_key.length >= 10 && c.api_secret.length >= 10)
      return (exch === "bingx" || exch === "bybit") && !isPredefined && hasCredentials
    }) || allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      const hasCredentials = !!(c.api_key && c.api_secret && c.api_key.length >= 10 && c.api_secret.length >= 10)
      return (exch === "bingx" || exch === "bybit" || exch === "binance" || exch === "okx") && hasCredentials
    }) || allConnections.find((c: any) => {
      // Fallback: any active-inserted connection without credentials (for setup mode)
      const exch = (c.exchange || "").toLowerCase()
      const isActiveInserted = c.is_active_inserted === "1" || c.is_active_inserted === true
      return (exch === "bingx" || exch === "bybit") && isActiveInserted
    })
    
    if (!connection) {
      console.log(`${LOG_PREFIX}: ✗ No BingX/Bybit connections found in Active panel`)
      console.log(`${LOG_PREFIX}: Available: ${allConnections.map((c: any) => `${c.name}(${c.is_active_inserted === "1" ? 'active' : 'inactive'})`).join(", ")}`)
      
      await logProgressionEvent("global", "quickstart_no_connection", "warning", "No BingX/Bybit connections in Active panel", {
        totalConnections: allConnections.length,
        availableExchanges: [...new Set(allConnections.map((c: any) => c.exchange))],
        hint: "Add a connection to the Active panel first via Dashboard",
      })
      
      return NextResponse.json(
        { 
          success: false,
          error: "No BingX/Bybit connections found in Active panel",
          message: "Add a BingX or Bybit connection to the Active panel first, then add API credentials in Settings",
          availableConnections: allConnections.map((c: any) => ({ 
            name: c.name,
            id: c.id,
            exchange: c.exchange,
            hasCredentials: !!(c.api_key && c.api_secret && c.api_key.length >= 10),
            isActiveInserted: c.is_active_inserted === "1" || c.is_active_inserted === true,
            isPredefined: c.is_predefined === true || c.is_predefined === "1",
          })),
          logs: await getProgressionLogs("global"),
        },
        { status: 400 }
      )
    }
    
    // Check if connection has credentials
    const hasCredentials = !!(connection.api_key && connection.api_secret && 
      connection.api_key.length >= 10 && connection.api_secret.length >= 10)
    
    const exchangeName = (connection.exchange || "").toLowerCase()
    const connectionId = connection.id
    console.log(`${LOG_PREFIX}: Found ${connection.name} (${connectionId}) on ${exchangeName}`)
    
    if (action === "disable") {
      // DISABLE: Clear dashboard fields
      console.log(`${LOG_PREFIX}: Disabling ${connection.name}...`)
      const disabled = {
        ...connection,
        is_dashboard_inserted: "0",
        is_enabled_dashboard: "0",
        is_enabled: "0",
        updated_at: new Date().toISOString(),
      }
      await updateConnection(connectionId, disabled)
      
      await logProgressionEvent(connectionId, "quickstart_disabled", "info", "Connection disabled via QuickStart", {
        connectionName: connection.name,
      })
      
      console.log(`${LOG_PREFIX}: ✓ Disabled ${connection.name}`)
      return NextResponse.json({
        success: true,
        action: "disable",
        connection: { id: connectionId, name: connection.name, exchange: exchangeName },
        version: API_VERSION,
      })
    }
    
    // ENABLE FLOW: Direct function calls (no HTTP fetch)
    await logProgressionEvent(connectionId, "quickstart_started", "info", "QuickStart enable flow initiated", {
      connectionId,
      connectionName: connection.name,
      exchange: exchangeName,
      hasCredentials,
    })
    
    // Step 1: Test connection (only if credentials exist)
    console.log(`${LOG_PREFIX}: [1/4] Testing connection...`)
    let testPassed = false
    let testError = ""
    let testBalance = null
    let testDuration = 0
    
    if (!hasCredentials) {
      // No credentials - skip test but log it
      console.log(`${LOG_PREFIX}: [1/4] SKIPPED - No API credentials configured`)
      testError = "No API credentials configured. Add credentials in Settings to enable trading."
      await logProgressionEvent(connectionId, "quickstart_test_skipped", "warning", "Test skipped - no credentials", {
        message: "Add API key and secret in Settings to enable trading",
      })
    } else {
      try {
        const testStart = Date.now()
        const connector = await createExchangeConnector(exchangeName, {
          apiKey: connection.api_key,
          apiSecret: connection.api_secret,
          apiPassphrase: connection.api_passphrase || "",
          isTestnet: false, // Always mainnet
          apiType: connection.api_type || "perpetual_futures",
        })
        
        const testResult = await Promise.race([
          connector.testConnection(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Test timeout (30s)")), 30000))
        ]) as any
        
        testDuration = Date.now() - testStart
        testPassed = testResult.success !== false
        testBalance = testResult.balance
        testError = testResult.error || ""
        
        console.log(`${LOG_PREFIX}: [1/4] ✓ Test ${testPassed ? "PASSED" : "FAILED"} (${testDuration}ms)${testBalance ? ` Balance: ${testBalance}` : ""}`)
        
        await logProgressionEvent(connectionId, "quickstart_test", testPassed ? "info" : "warning", 
          `Connection test ${testPassed ? "passed" : "failed"}`, {
            testPassed,
            testError: testError || undefined,
            balance: testBalance,
            duration: testDuration,
          })
      } catch (testErr) {
        testDuration = Date.now() - startTime
        testError = testErr instanceof Error ? testErr.message : String(testErr)
        console.log(`${LOG_PREFIX}: [1/4] ✗ Test ERROR: ${testError}`)
        
        await logProgressionEvent(connectionId, "quickstart_test_error", "error", "Connection test failed", {
          error: testError,
          duration: testDuration,
        })
      }
    }
    
    // Step 2: Get symbols (use defaults - direct API calls to exchange are optional)
    console.log(`${LOG_PREFIX}: [2/4] Configuring symbols...`)
    let symbols = body.symbols || [...DEFAULT_SYMBOLS]
    
    // Try to get exchange-specific top symbols if connector supports it
    if (testPassed) {
      try {
        const connector = await createExchangeConnector(exchangeName, {
          apiKey: connection.api_key,
          apiSecret: connection.api_secret,
          isTestnet: false,
        })
        
        if (typeof connector.getTopSymbols === "function") {
          const topSymbols = await connector.getTopSymbols(3)
          if (topSymbols && topSymbols.length > 0) {
            symbols = topSymbols
            console.log(`${LOG_PREFIX}: [2/4] ✓ Retrieved top symbols from exchange: ${symbols.join(", ")}`)
          }
        }
      } catch {
        // Use defaults if retrieval fails
      }
    }
    console.log(`${LOG_PREFIX}: [2/4] ✓ Symbols: ${symbols.join(", ")}`)
    
    await logProgressionEvent(connectionId, "quickstart_symbols", "info", "Trading symbols configured", {
      symbols,
      count: symbols.length,
    })
    
    // Step 3: Update connection state - ADD TO ACTIVE CONNECTIONS
    console.log(`${LOG_PREFIX}: [3/4] Updating connection state...`)
    const enabled = {
      ...connection,
      is_enabled: "1",
      is_enabled_dashboard: "0", // User must toggle Enable to start processing
      is_dashboard_inserted: "1",
      is_active_inserted: "1",
      is_active: "1",
      is_inserted: "1",
      is_testnet: false, // Always mainnet
      active_symbols: JSON.stringify(symbols),
      last_test_status: testPassed ? "success" : "failed",
      last_test_balance: testBalance,
      last_test_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await updateConnection(connectionId, enabled)
    console.log(`${LOG_PREFIX}: [3/4] ✓ Connection added to Active panel`)
    
    await logProgressionEvent(connectionId, "quickstart_updated", "info", "Connection state updated", {
      is_enabled: "1",
      is_active_inserted: "1",
      symbols,
    })
    
    // Step 4: Initialize engine progression state
    console.log(`${LOG_PREFIX}: [4/4] Initializing engine state...`)
    await setSettings(`engine_progression:${connectionId}`, {
      phase: "ready",
      progress: 0,
      connectionId,
      connectionName: connection.name,
      exchange: exchangeName,
      symbols,
      testPassed,
      detail: testPassed 
        ? "Connection ready. Toggle Enable on dashboard to start processing."
        : `Connection test failed: ${testError}. Fix credentials and retry.`,
      updated_at: new Date().toISOString(),
    })
    
    // Store in global quickstart state for dashboard visibility
    const client = getRedisClient()
    await client.set("quickstart:last_run", JSON.stringify({
      connectionId,
      connectionName: connection.name,
      exchange: exchangeName,
      testPassed,
      testError: testError || undefined,
      symbols,
      timestamp: new Date().toISOString(),
    }))
    
    await logProgressionEvent(connectionId, "quickstart_complete", "info", "QuickStart completed successfully", {
      testPassed,
      symbols,
      totalDuration: Date.now() - startTime,
    })
    
    const totalDuration = Date.now() - startTime
    console.log(`${LOG_PREFIX}: === QUICKSTART COMPLETE ===`)
    console.log(`${LOG_PREFIX}: Connection: ${connection.name}`)
    console.log(`${LOG_PREFIX}: Test: ${testPassed ? "PASSED" : "FAILED"}`)
    console.log(`${LOG_PREFIX}: Symbols: ${symbols.join(", ")}`)
    console.log(`${LOG_PREFIX}: Duration: ${totalDuration}ms`)
    console.log(`${LOG_PREFIX}: Next: Toggle Enable on dashboard to start engine`)
    
    return NextResponse.json({
      success: true,
      action: "enable",
      connection: {
        id: connectionId,
        name: connection.name,
        exchange: exchangeName,
        is_enabled: "1",
        is_active_inserted: "1",
        testPassed,
        testError: testError || undefined,
        testBalance,
      },
      symbols,
      message: testPassed 
        ? `Connection added to Active Connections. Toggle Enable to start processing.`
        : `Connection added but test failed: ${testError}. Check credentials.`,
      duration: totalDuration,
      version: API_VERSION,
    })
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`${LOG_PREFIX}: FATAL ERROR:`, errorMsg)
    
    await logProgressionEvent("global", "quickstart_error", "error", "QuickStart failed with exception", {
      error: errorMsg,
      duration: Date.now() - startTime,
    })
    
    return NextResponse.json(
      { 
        success: false, 
        error: "Quick start failed", 
        details: errorMsg, 
        version: API_VERSION 
      },
      { status: 500 }
    )
  }
}
