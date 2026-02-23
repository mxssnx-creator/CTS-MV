import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { createExchangeConnector } from "@/lib/exchange-connectors"
import { initRedis, getConnection, updateConnection, getSettings, getAllConnections } from "@/lib/redis-db"
import { getConnectionManager } from "@/lib/connection-manager"
import { RateLimiter } from "@/lib/rate-limiter"
import { apiErrorHandler, ApiError } from "@/lib/api-error-handler"

const TEST_TIMEOUT_MS = 30000
const testAttemptMap = new Map<string, { count: number; lastTime: number }>()
const MAX_TESTS_PER_MINUTE = 3

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const testLog: string[] = []
  const startTime = Date.now()
  const { id } = await params
  const body = await request.json()

  try {
    const now = Date.now()
    const attempt = testAttemptMap.get(id) || { count: 0, lastTime: 0 }

    if (now - attempt.lastTime > 60000) {
      attempt.count = 0
    }

    if (attempt.count >= MAX_TESTS_PER_MINUTE) {
      testLog.push(`[${new Date().toISOString()}] ERROR: Too many test attempts (${attempt.count}/${MAX_TESTS_PER_MINUTE}) in the last minute`)
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          details: `Maximum ${MAX_TESTS_PER_MINUTE} tests per minute per connection. Please wait before retrying.`,
          log: testLog,
        },
        { status: 429 }
      )
    }

    attempt.count++
    attempt.lastTime = now
    testAttemptMap.set(id, attempt)

    testLog.push(`[${new Date().toISOString()}] Starting connection test for ID: ${id}`)
    testLog.push(`[${new Date().toISOString()}] Using API Type: ${body.api_type || "perpetual_futures"}`)

    // CRITICAL: Initialize Redis first and verify it's ready
    await initRedis()
    
    // Small delay to ensure Redis client is fully initialized
    await new Promise(resolve => setTimeout(resolve, 100))

    const connection = await getConnection(id)

    if (!connection) {
      // Debug: try to get all connections to verify they exist
      const allConns = await getAllConnections()
      const availableIds = allConns.map((c: any) => c.id)
      console.log("[v0] [Test] Connection not found. Available IDs:", availableIds)
      console.log("[v0] [Test] Looking for ID:", id)
      console.log("[v0] [Test] ID exists in available IDs:", availableIds.includes(id))
      
      testLog.push(`[${new Date().toISOString()}] ERROR: Connection not found (ID: ${id})`)
      testLog.push(`[${new Date().toISOString()}] Available connection IDs: ${availableIds.join(", ")}`)
      throw new ApiError(`Connection not found with ID: ${id}`, {
        statusCode: 404,
        code: "CONNECTION_NOT_FOUND",
        details: { connectionId: id, availableIds },
        context: { operation: "test_connection" },
      })
    }

    testLog.push(`[${new Date().toISOString()}] Connection found: ${connection.name} (${connection.exchange})`)

    // Validate credentials - check for placeholder/test values
    const apiKey = body.api_key || connection.api_key
    const isPlaceholder = !apiKey || 
      apiKey === "" || 
      apiKey.includes("PLACEHOLDER") ||
      apiKey.includes("00998877") ||
      apiKey.startsWith("test") ||
      apiKey.length < 20

    if (isPlaceholder) {
      testLog.push(`[${new Date().toISOString()}] WARNING: API key is placeholder or test credentials`)
      testLog.push(`[${new Date().toISOString()}] Please configure valid API credentials for this exchange before testing`)

      await updateConnection(id, {
        ...connection,
        last_test_status: "warning",
        last_test_log: JSON.stringify(testLog),
        last_test_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      return NextResponse.json(
        {
          error: "Credentials not configured",
          details: `This connection is using placeholder credentials. Please enter your real ${connection.exchange.toUpperCase()} API credentials in the Settings page to test the connection.`,
          log: testLog,
          duration: Date.now() - startTime,
        },
        { status: 400 }
      )
    }

    let minInterval = 200
    try {
      const settings = await getSettings("all_settings")
      minInterval = settings?.minimum_connect_interval || 200
    } catch (settingsError) {
      testLog.push(`[${new Date().toISOString()}] Using default connect interval: ${minInterval}ms`)
    }

    testLog.push(`[${new Date().toISOString()}] Minimum connect interval: ${minInterval}ms`)

    const rateLimiter = new RateLimiter(connection.exchange)

    const testResult = await rateLimiter.execute(async () => {
      await new Promise((resolve) => setTimeout(resolve, minInterval))

      // Use request body values (which may be edited, unsaved values) OR fall back to stored connection
      const connector = await createExchangeConnector(connection.exchange, {
        apiKey: body.api_key || connection.api_key,
        apiSecret: body.api_secret || connection.api_secret,
        apiPassphrase: body.api_passphrase || connection.api_passphrase || "",
        isTestnet: body.is_testnet !== undefined ? body.is_testnet : (connection.is_testnet || false),
        apiType: body.api_type || connection.api_type,
        connectionMethod: body.connection_method || connection.connection_method,
        connectionLibrary: body.connection_library || connection.connection_library,
      })

      const testPromise = connector.testConnection()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection test timeout after 30 seconds")), TEST_TIMEOUT_MS)
      )

      return await Promise.race([testPromise, timeoutPromise])
    })

    const result = testResult as any

    if (!result.success) {
      throw new Error(result.error || "Connection test failed")
    }

    const duration = Date.now() - startTime
    testLog.push(`[${new Date().toISOString()}] Connection successful!`)
    testLog.push(`[${new Date().toISOString()}] Account Balance: ${result.balance.toFixed(4)} USDT`)
    if (result.btcPrice) {
      testLog.push(`[${new Date().toISOString()}] BTC Price: $${result.btcPrice.toFixed(2)}`)
    }

    const testedApiType = body.api_type || connection.api_type || "perpetual_futures"
    await updateConnection(id, {
      ...connection,
      last_test_status: "success",
      last_test_balance: String(result.balance),
      last_test_log: JSON.stringify(testLog),
      last_test_at: new Date().toISOString(),
      api_type: testedApiType,
      api_capabilities: JSON.stringify(result.capabilities || []),
      updated_at: new Date().toISOString(),
    })

    await SystemLogger.logConnection(`Connection test successful: ${connection.name}`, id, "info", {
      balance: result.balance,
      btcPrice: result.btcPrice,
      duration,
    })

    return NextResponse.json({
      success: true,
      balance: result.balance,
      btcPrice: result.btcPrice || 0,
      balances: result.balances || [],
      capabilities: result.capabilities || [],
      apiType: body.api_type || connection.api_type,
      apiSubtype: body.api_subtype || connection.api_subtype,
      exchange: connection.exchange,
      connectionMethod: body.connection_method || connection.connection_method,
      connectionLibrary: body.connection_library || connection.connection_library,
      log: testLog,
      duration,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    
    if (error instanceof ApiError) {
      // Already an API error, log and return
      await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/test")
      return await apiErrorHandler.handleError(error, {
        endpoint: "/api/settings/connections/[id]/test",
        method: "POST",
        operation: "test_connection",
        severity: error.severity,
      })
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    testLog.push(`[${new Date().toISOString()}] Test failed: ${errorMessage}`)

    let userFriendlyError = errorMessage
    if (errorMessage.includes("JSON")) {
      userFriendlyError = "API returned invalid response. Check your credentials or try again."
    } else if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      userFriendlyError = "Invalid API credentials. Please verify your API key and secret."
    } else if (errorMessage.includes("timeout")) {
      userFriendlyError = "Connection timeout. Check your network or if the API endpoint is available."
    } else if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("ERR_MODULE_NOT_FOUND")) {
      userFriendlyError = "Network error. Check your internet connection."
    }

    console.error("[v0] Connection test failed:", error)
    await SystemLogger.logError(error instanceof Error ? error : new Error(String(error)), "api", "POST /api/settings/connections/[id]/test")

    // Try to update connection with error status
    try {
      const existingConnection = await getConnection(id)
      if (existingConnection) {
        await updateConnection(id, {
          ...existingConnection,
          last_test_status: "failed",
          last_test_log: JSON.stringify(testLog),
          last_test_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        const manager = getConnectionManager()
        await manager.markTestFailed(id, userFriendlyError)
      }
    } catch (updateError) {
      console.error("[v0] Failed to update connection error status:", updateError)
    }

    return NextResponse.json(
      {
        success: false,
        error: "Connection test failed",
        details: userFriendlyError,
        log: testLog,
        duration,
      },
      { status: 500 }
    )
  }
}
