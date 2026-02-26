import { type NextRequest, NextResponse } from "next/server"
import { getAllConnections, initRedis, createConnection } from "@/lib/redis-db"
import { generateConnectionIdFromApiKey, isApiKeyInUse } from "@/lib/connection-id-manager"
import { CONNECTION_PREDEFINITIONS } from "@/lib/connection-predefinitions"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const exchange = searchParams.get("exchange")
    const enabled = searchParams.get("enabled")
    const dashboard = searchParams.get("dashboard")

    await initRedis()
    let connections = await getAllConnections()

    // Base exchanges that are AUTO-INSERTED by default (only bybit and bingx)
    // These should be enabled by default since they were inserted by init
    const AUTO_INSERTED_EXCHANGES = ["bybit", "bingx"]
    
    // Only force-enable the auto-inserted base connections
    connections = connections.map((c) => {
      const exchange = (c.exchange || "").toLowerCase().trim()
      const isAutoInserted = AUTO_INSERTED_EXCHANGES.includes(exchange)
      const isInserted = c.is_inserted === "1" || c.is_inserted === true
      
      // Enable only if: auto-inserted exchange AND was explicitly inserted
      if (isAutoInserted && isInserted && (!c.is_enabled || c.is_enabled === "0" || c.is_enabled === false)) {
        return { ...c, is_enabled: "1" }
      }
      return c
    })

    // Auto-initialize predefined connections if none exist
    if (connections.length === 0) {
      console.log("[v0] [API] No connections found, auto-initializing predefined connections...")
      
      for (const predefined of CONNECTION_PREDEFINITIONS) {
        try {
          const connection = {
            id: predefined.id,
            name: predefined.name,
            exchange: predefined.exchange,
            api_type: predefined.apiType || "perpetual_futures",
            connection_method: predefined.connectionMethod || "rest",
            connection_library: predefined.connectionLibrary || "native",
            margin_type: predefined.marginType || "cross",
            position_mode: predefined.positionMode || "hedge",
            is_testnet: false,
            is_enabled: false, // Disabled by default (user must enable in Settings)
            is_enabled_dashboard: false, // Not in active connections by default
            is_predefined: true,
            is_live_trade: false, // Main engine disabled by default
            is_preset_trade: false, // Preset engine disabled by default
            api_key: predefined.apiKey || "",
            api_secret: predefined.apiSecret || "",
            api_passphrase: "",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          
          await createConnection(connection)
          console.log(`[v0] [API] Auto-created predefined connection: ${predefined.name}`)
        } catch (error) {
          console.error(`[v0] [API] Failed to auto-create ${predefined.name}:`, error)
        }
      }
      
      // Reload connections after initialization
      connections = await getAllConnections()
      console.log("[v0] [API] Predefined connections initialized, total:", connections.length)
    }

    if (exchange) {
      connections = connections.filter((c) => c.exchange?.toLowerCase() === exchange.toLowerCase())
    }

    // Filter by is_enabled for trade engine status (Settings connections)
    if (enabled === "true") {
      connections = connections.filter((c) => {
        // Handle both boolean and string representations
        const isEnabled = c.is_enabled === true || c.is_enabled === "1" || c.is_enabled === "true"
        return isEnabled
      })
    }

    // Filter by is_enabled_dashboard for actively using connections (INDEPENDENT from Settings)
    if (dashboard === "true") {
      connections = connections.filter((c) => {
        // Handle both boolean and string representations
        const isEnabledDash = c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === "true"
        return isEnabledDash
      })
    }

    return NextResponse.json({ success: true, count: connections.length, connections })
  } catch (error) {
    console.error("[v0] Error fetching connections:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ success: false, error: "Failed to fetch connections", connections: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate required fields
    if (!body.name || !body.exchange || !body.api_key || !body.api_secret) {
      return NextResponse.json(
        { error: "Missing required fields: name, exchange, api_key, api_secret" },
        { status: 400 }
      )
    }

    await initRedis()

    // Check if API key is already in use
    const exists = await isApiKeyInUse(body.exchange, body.api_key)
    if (exists) {
      return NextResponse.json(
        { 
          error: "This API key is already connected",
          details: "Please remove the existing connection first or use a different API key"
        },
        { status: 409 }
      )
    }

    // Generate unique connection ID based on exchange + API key
    const connectionId = generateConnectionIdFromApiKey(body.exchange, body.api_key)

    // Create connection object with all required fields
    const connection = {
      id: connectionId,
      name: body.name,
      exchange: body.exchange,
      api_key: body.api_key,
      api_secret: body.api_secret,
      api_passphrase: body.api_passphrase || "",
      api_type: body.api_type || "perpetual_futures",
      api_subtype: body.api_type === "unified" ? (body.api_subtype || "perpetual") : undefined,
      connection_method: body.connection_method || "rest",
      connection_library: body.connection_library || "native",
      margin_type: body.margin_type || "cross",
      position_mode: body.position_mode || "hedge",
      is_testnet: body.is_testnet || false,
      is_enabled: body.is_enabled === true, // Settings: trade engine (default false for new)
      is_enabled_dashboard: false, // Dashboard: always default to false (disabled)
      is_active: false, // New connections start inactive in dashboard
      is_predefined: false,
      is_live_trade: false,
      is_preset_trade: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Save to Redis database
    await createConnection(connection)

    console.log("[v0] [API] Connection created successfully:", {
      id: connectionId,
      name: body.name,
      exchange: body.exchange,
    })

    return NextResponse.json(
      {
        success: true,
        message: "Connection created successfully",
        id: connectionId,
        connectionId: connectionId,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[v0] Error creating connection:", error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: "Failed to create connection", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
