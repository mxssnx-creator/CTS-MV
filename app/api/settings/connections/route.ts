import { type NextRequest, NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { SystemLogger } from "@/lib/system-logger"
import { getAllConnections, createConnection, initRedis } from "@/lib/redis-db"
import { getPredefinedConnectionsAsStatic } from "@/lib/connection-predefinitions"
import { generateConnectionIdFromApiKey, isApiKeyInUse, findConnectionByApiKey } from "@/lib/connection-id-manager"
import { ConnectionDataArchive } from "@/lib/connection-data-archive"

const EXCHANGE_NAME_TO_ID: Record<string, number> = {
  binance: 1,
  bybit: 2,
  okx: 3,
  gateio: 4,
  mexc: 5,
  bitget: 6,
  kucoin: 7,
  huobi: 8,
  bingx: 9,
  pionex: 10,
  orangex: 11,
}

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Fetching connections from Redis...")
    const { searchParams } = new URL(request.url)

    const exchange = searchParams.get("exchange")
    const apiType = searchParams.get("apiType")
    const enabled = searchParams.get("enabled")
    const active = searchParams.get("active")

    await SystemLogger.logAPI("Fetching connections", "info", "GET /api/settings/connections", {
      exchange,
      apiType,
      enabled,
      active,
    })

    let connections: any[] = []
    try {
      await initRedis()
      connections = await getAllConnections()
      if (!Array.isArray(connections) || connections.length === 0) {
        console.log("[v0] No connections in Redis, seeding predefined connections...")
        const { getPredefinedAsExchangeConnections } = await import("@/lib/connection-predefinitions")
        const predefined = getPredefinedAsExchangeConnections()
        
        console.log(`[v0] [Seeding] Starting to seed ${predefined.length} connections...`)
        
        // Save all predefined connections to Redis with proper defaults
        for (const conn of predefined) {
          try {
            // Ensure enabled connections are also active for trade engine auto-start
            const connectionData = {
              ...conn,
              is_active: conn.is_enabled !== false, // Active if enabled
            }
            await createConnection(connectionData)
            console.log(`[v0] Seeded ${conn.name} (enabled: ${conn.is_enabled}, active: ${connectionData.is_active})`)
          } catch (createError) {
            console.warn(`[v0] Failed to seed connection ${conn.name}:`, createError)
          }
        }
        
        // Fetch the saved connections
        connections = await getAllConnections()
        console.log(`[v0] Seeded and loaded ${connections.length} predefined connections`)
        
        // Log active connections for debugging
        const activeCount = connections.filter(c => c.is_active).length
        console.log(`[v0] Active connections: ${activeCount}/${connections.length}`)
      }
    } catch (error) {
      console.log("[v0] Failed to load connections from Redis:", error)
      const { getPredefinedAsExchangeConnections } = await import("@/lib/connection-predefinitions")
      connections = getPredefinedAsExchangeConnections()
    }

    // Apply filters
    let filtered = connections

    if (exchange) {
      filtered = filtered.filter((c) => c.exchange?.toLowerCase() === exchange.toLowerCase())
    }

    if (apiType) {
      filtered = filtered.filter((c) => c.api_type === apiType)
    }

    if (enabled !== null) {
      const enabledBool = enabled === "true"
      filtered = filtered.filter((c) => Boolean(c.is_enabled) === enabledBool)
    }

    if (active !== null) {
      const activeBool = active === "true"
      filtered = filtered.filter((c) => Boolean(c.is_active) === activeBool)
    }

    console.log(`[v0] Found ${filtered.length} connections (from ${connections.length} total)`)

    const formattedConnections = filtered.map((conn) => ({
      ...conn,
      is_enabled: Boolean(conn.is_enabled),
      is_live_trade: Boolean(conn.is_live_trade),
      is_preset_trade: Boolean(conn.is_preset_trade),
      is_testnet: Boolean(conn.is_testnet),
      is_active: Boolean(conn.is_active),
      is_predefined: Boolean(conn.is_predefined),
      volume_factor: typeof conn.volume_factor === "number" ? conn.volume_factor : 1.0,
      exchange_id: conn.exchange_id || EXCHANGE_NAME_TO_ID[conn.exchange?.toLowerCase()] || null,
    }))

    return NextResponse.json(
      {
        success: true,
        count: formattedConnections.length,
        filters: { exchange, apiType, enabled, active },
        connections: formattedConnections,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[v0] Error fetching connections:", error)
    await SystemLogger.logError(error, "api", "GET /api/settings/connections")

    const predefinedConnections = getPredefinedConnectionsAsStatic()
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch connections",
        count: 0,
        connections: predefinedConnections,
      },
      { status: 200 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log("[v0] Creating new connection:", {
      name: body.name,
      exchange: body.exchange,
      api_type: body.api_type,
    })

    await SystemLogger.logAPI(
      `Creating connection: ${body.name} (${body.exchange})`,
      "info",
      "POST /api/settings/connections",
      { exchange: body.exchange, api_type: body.api_type },
    )

    if (!body.name || !body.exchange) {
      await SystemLogger.logAPI("Missing required fields", "warn", "POST /api/settings/connections")
      return NextResponse.json(
        { error: "Missing required fields", details: "Connection name and exchange are required" },
        { status: 400 },
      )
    }

    if (!body.api_key || !body.api_secret) {
      await SystemLogger.logAPI("Missing API credentials", "warn", "POST /api/settings/connections")
      return NextResponse.json(
        { error: "Missing API credentials", details: "Both API key and API secret are required" },
        { status: 400 },
      )
    }

    const supportedExchanges = [
      "bybit",
      "bingx",
      "pionex",
      "orangex",
      "binance",
      "okx",
      "gateio",
      "mexc",
      "bitget",
      "kucoin",
      "huobi",
    ]
    if (!supportedExchanges.includes(body.exchange.toLowerCase())) {
      return NextResponse.json(
        { error: "Unsupported exchange", details: `Exchange ${body.exchange} is not supported` },
        { status: 400 },
      )
    }

    // Check if API key already in use
    const exchangeName = body.exchange.toLowerCase()
    const apiKeyInUse = await isApiKeyInUse(exchangeName, body.api_key)
    
    if (apiKeyInUse) {
      console.log(`[v0] API key already in use for exchange ${exchangeName}`)
      return NextResponse.json(
        { 
          error: "API key already in use",
          details: `This API key is already connected for ${exchangeName}. Remove the existing connection first to re-add it.`
        },
        { status: 409 },
      )
    }

    // Generate ID from API key to ensure uniqueness and persistence
    const connectionId = generateConnectionIdFromApiKey(exchangeName, body.api_key)
    const exchangeId = EXCHANGE_NAME_TO_ID[exchangeName] || null

    // Check if a connection with this ID already exists (from previous add/remove cycle)
    const existingConnection = await findConnectionByApiKey(exchangeName, body.api_key)
    
    if (existingConnection && existingConnection.id === connectionId) {
      console.log(`[v0] Restoring connection from previous state: ${connectionId}`)
      // Connection was previously added and is being re-added - preserve its data
      const restoredConnection = {
        ...existingConnection,
        name: body.name,
        api_type: body.api_type || existingConnection.api_type || "perpetual_futures",
        connection_method: body.connection_method || existingConnection.connection_method || "rest",
        connection_library: body.connection_library || existingConnection.connection_library || "native",
        margin_type: body.margin_type || existingConnection.margin_type || "cross",
        position_mode: body.position_mode || existingConnection.position_mode || "hedge",
        is_testnet: body.is_testnet !== undefined ? body.is_testnet : existingConnection.is_testnet,
        is_enabled: true,
        is_active: true,
        updated_at: new Date().toISOString(),
      }
      await initRedis()
      await createConnection(restoredConnection)
      
      // Restore archived data for this connection
      console.log(`[v0] Attempting to restore archived data for ${connectionId}...`)
      try {
        await ConnectionDataArchive.restoreConnectionData(connectionId, body.api_key)
        console.log(`[v0] Successfully restored archived data for ${connectionId}`)
      } catch (archiveError) {
        console.warn(`[v0] Warning: Could not restore archived data:`, archiveError)
      }
      
      console.log(`[v0] Connection restored with ID: ${connectionId}`)
    } else {
      const newConnection: any = {
        id: connectionId,
        user_id: 1,
        name: body.name,
        exchange: exchangeName,
        exchange_id: exchangeId,
        api_type: body.api_type || "perpetual_futures",
        api_subtype: body.api_subtype || "perpetual",
        connection_method: body.connection_method || "rest",
        connection_library: body.connection_library || "native",
        api_key: body.api_key,
        api_secret: body.api_secret,
        api_passphrase: body.api_passphrase || "",
        margin_type: body.margin_type || "cross",
        position_mode: body.position_mode || "hedge",
        is_testnet: body.is_testnet || false,
        is_enabled: true,
        is_live_trade: false,
        is_preset_trade: false,
        is_active: true,
        is_predefined: false,
        volume_factor: body.volume_factor || 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Save to Redis
      await initRedis()
      await createConnection(newConnection)
      console.log(`[v0] Connection created successfully: ${connectionId}`)
    }

    await SystemLogger.logConnection(`Connection created: ${body.name}`, connectionId, "info", {
      exchange: body.exchange,
      testnet: body.is_testnet,
    })

    return NextResponse.json(
      {
        success: true,
        id: connectionId,
        message: "Connection created successfully",
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[v0] Error creating connection:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings/connections")

    return NextResponse.json(
      {
        error: "Failed to create connection",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
