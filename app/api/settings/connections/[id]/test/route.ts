import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { createExchangeConnector } from "@/lib/exchange-connectors"
import { initRedis, getConnection, updateConnection, getSettings } from "@/lib/redis-db"
import { getConnectionManager } from "@/lib/connection-manager"
import { RateLimiter } from "@/lib/rate-limiter"

const TEST_TIMEOUT_MS = 30000
const testAttemptMap = new Map<string, { count: number; lastTime: number }>()
const MAX_TESTS_PER_MINUTE = 3

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const testLog: string[] = []
  const startTime = Date.now()
  const { id } = await params

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

    await initRedis()

    const connection = await getConnection(id)

    if (!connection) {
      testLog.push(`[${new Date().toISOString()}] ERROR: Connection not found (ID: ${id})`)
      await SystemLogger.logAPI(`Connection test failed: not found - ${id}`, "error", "POST /api/settings/connections/[id]/test")
      return NextResponse.json(
        {
          error: "Connection not found",
          details: `No connection with ID ${id} found in database`,
          log: testLog,
        },
        { status: 404 }
      )
    }

    testLog.push(`[${new Date().toISOString()}] Connection found: ${connection.name} (${connection.exchange})`)

    // Validate credentials - check for placeholder/test values
    const isPlaceholder = !connection.api_key || 
      connection.api_key === "" || 
      connection.api_key.includes("PLACEHOLDER") ||
      connection.api_key.includes("00998877") ||
      connection.api_key.startsWith("test") ||
      connection.api_key.length < 20

    if (isPlaceholder) {
      testLog.push(`[${new Date().toISOString()}] WARNING: API key is placeholder or test credentials`)
      testLog.push(`[${new Date().toISOString()}] Please configure valid API credentials for this exchange before testing`)

      await updateConnection(id, {
        ...connection,
        last_test_status: "warning",
        last_test_log: testLog,
        last_test_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const manager = getConnectionManager()
      await manager.markTestFailed(id, "API credentials not configured - using placeholder/test values")

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

      const connector = await createExchangeConnector(connection.exchange, {
        apiKey: connection.api_key,
        apiSecret: connection.api_secret,
        apiPassphrase: connection.api_passphrase || "",
        isTestnet: connection.is_testnet || false,
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
    testLog.push(`[${new Date().toISOString()}] Account Balance: ${result.balance.toFixed(2)} USDT`)
    
    // Calculate total assets across all balances
    const totalAssets = (result.balances || []).reduce((sum: number, b: any) => {
      const balanceValue = Number.parseFloat(b.total || b.balance || b.free || "0")
      return sum + balanceValue
    }, 0)
    
    testLog.push(`[${new Date().toISOString()}] Total Assets: ${totalAssets.toFixed(2)}`)
    testLog.push(`[${new Date().toISOString()}] Assets breakdown: ${result.balances?.length || 0} currencies`)

    await updateConnection(id, {
      ...connection,
      last_test_status: "success",
      last_test_balance: result.balance,
      last_test_assets: totalAssets,
      last_test_log: testLog,
      last_test_at: new Date().toISOString(),
      api_capabilities: JSON.stringify(result.capabilities || []),
      updated_at: new Date().toISOString(),
    })

    const manager = getConnectionManager()
    await manager.markTestPassed(id, result.balance)

    await SystemLogger.logConnection(`Connection test successful: ${connection.name}`, id, "info", {
      balance: result.balance,
      duration,
    })

    return NextResponse.json({
      success: true,
      balance: result.balance,
      totalAssets: totalAssets,
      balances: result.balances || [],
      capabilities: result.capabilities || [],
      log: testLog,
      duration,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

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

    testLog.push(`[${new Date().toISOString()}] Test failed: ${errorMessage}`)

    console.error("[v0] Connection test failed:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/test")

    try {
      const existingConnection = await getConnection(id)
      if (existingConnection) {
        await updateConnection(id, {
          ...existingConnection,
          last_test_status: "failed",
          last_test_log: testLog,
          last_test_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        const manager = getConnectionManager()
        await manager.markTestFailed(id, userFriendlyError)
      }
    } catch (updateError) {
      console.error("[v0] Failed to update connection with error status:", updateError)
    }

    return NextResponse.json(
      {
        error: "Connection test failed",
        details: userFriendlyError,
        log: testLog,
        duration,
      },
      { status: 500 }
    )
  }
}
