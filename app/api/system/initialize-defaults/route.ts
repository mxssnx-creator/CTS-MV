import { type NextRequest, NextResponse } from "next/server"
import { initRedis, createConnection, getAllConnections } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

/**
 * POST /api/system/initialize-defaults
 * Initialize system with default disabled exchanges (Bybit and BingX)
 * These are pre-configured but disabled until user provides credentials
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[v0] [Initialize Defaults] Starting default exchange initialization...")

    await initRedis()
    const existingConnections = await getAllConnections()

    // Define default disabled exchanges
    const defaultExchanges = [
      {
        id: "bybit-default-disabled",
        name: "Bybit (Default)",
        exchange: "bybit",
        api_type: "perpetual_futures",
        connection_method: "rest",
        connection_library: "native",
        api_key: "",
        api_secret: "",
        api_passphrase: "",
        margin_type: "cross",
        position_mode: "hedge",
        is_testnet: false,
        is_enabled: false,
        is_active: false,
        is_predefined: true,
        is_live_trade: false,
        is_preset_trade: false,
        volume_factor: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "bingx-default-disabled",
        name: "BingX (Default)",
        exchange: "bingx",
        api_type: "perpetual_futures",
        connection_method: "rest",
        connection_library: "native",
        api_key: "",
        api_secret: "",
        api_passphrase: "",
        margin_type: "cross",
        position_mode: "hedge",
        is_testnet: false,
        is_enabled: false,
        is_active: false,
        is_predefined: true,
        is_live_trade: false,
        is_preset_trade: false,
        volume_factor: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]

    let created = 0
    let skipped = 0

    for (const exchange of defaultExchanges) {
      const exists = existingConnections.some((c) => c.id === exchange.id)
      if (!exists) {
        await createConnection(exchange)
        console.log(`[v0] [Initialize Defaults] Created default exchange: ${exchange.name}`)
        created++
      } else {
        console.log(`[v0] [Initialize Defaults] Skipped existing default exchange: ${exchange.name}`)
        skipped++
      }
    }

    await SystemLogger.logAPI(
      `Initialized default exchanges: ${created} created, ${skipped} already exist`,
      "info",
      "POST /api/system/initialize-defaults",
      { created, skipped }
    )

    return NextResponse.json(
      {
        success: true,
        message: "Default exchanges initialized",
        created,
        skipped,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[v0] [Initialize Defaults] Error:", error)
    await SystemLogger.logError(error, "api", "POST /api/system/initialize-defaults")
    return NextResponse.json(
      {
        error: "Failed to initialize defaults",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/system/initialize-defaults
 * Check status of default exchanges
 */
export async function GET(request: NextRequest) {
  try {
    console.log("[v0] [Initialize Defaults] Checking default exchange status...")

    await initRedis()
    const connections = await getAllConnections()

    const defaults = connections.filter((c) => c.is_predefined)
    const bybit = defaults.find((c) => c.exchange === "bybit")
    const bingx = defaults.find((c) => c.exchange === "bingx")

    return NextResponse.json(
      {
        status: "ready",
        defaults: {
          bybit: bybit ? { id: bybit.id, enabled: bybit.is_enabled, active: bybit.is_active } : null,
          bingx: bingx ? { id: bingx.id, enabled: bingx.is_enabled, active: bingx.is_active } : null,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[v0] [Initialize Defaults] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to check status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
