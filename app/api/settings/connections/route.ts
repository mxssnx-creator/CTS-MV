import { type NextRequest, NextResponse } from "next/server"
import { getAllConnections, initRedis, createConnection, updateConnection } from "@/lib/redis-db"
import { generateConnectionIdFromApiKey, isApiKeyInUse } from "@/lib/connection-id-manager"
import { CONNECTION_PREDEFINITIONS } from "@/lib/connection-predefinitions"

export const runtime = "nodejs"

// Dashboard auto-inserted exchanges - ONLY these show on dashboard by default
const DASHBOARD_AUTO_INSERTED = ["bybit", "bingx"]

export async function GET(request: NextRequest) {
  try {
    // Set explicit cache-control headers to prevent caching
    const headers = {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    }
    
    const { searchParams } = new URL(request.url)
    const exchange = searchParams.get("exchange")
    const enabled = searchParams.get("enabled")
    const dashboard = searchParams.get("dashboard")

    await initRedis()
    let connections = await getAllConnections()

    // CRITICAL MIGRATION: Enforce ONLY bybit and bingx on dashboard
    // This must run on EVERY request to ensure no other exchanges are wrongly inserted
    console.log(`[v0] [API] [Migration] Starting - found ${connections.length} connections`)
    for (const c of connections) {
      const exch = (c.exchange || "").toLowerCase().trim()
      const shouldBeOnDashboard = DASHBOARD_AUTO_INSERTED.includes(exch)
      const currentlyInserted = c.is_dashboard_inserted === "1" || c.is_dashboard_inserted === true
      
      console.log(`[v0] [API] [Migration] ${c.name}: exchange=${exch}, shouldBeDashboard=${shouldBeOnDashboard}, currentlyInserted=${currentlyInserted}, raw_value=${JSON.stringify(c.is_dashboard_inserted)}`)
      
      // Enforce correct state: bybit/bingx must be inserted, others must not be
      if (shouldBeOnDashboard && !currentlyInserted) {
        await updateConnection(c.id, {
          ...c,
          is_dashboard_inserted: "1",
          is_enabled_dashboard: "0",
          updated_at: new Date().toISOString(),
        })
        console.log(`[v0] [API] [Migration] SET: ${c.exchange} dashboard_inserted=1`)
      } else if (!shouldBeOnDashboard && currentlyInserted) {
        await updateConnection(c.id, {
          ...c,
          is_dashboard_inserted: "0",
          is_enabled_dashboard: "0",
          updated_at: new Date().toISOString(),
        })
        console.log(`[v0] [API] [Migration] RESET: ${c.exchange} dashboard_inserted=0`)
      }
    }
    console.log(`[v0] [API] [Migration] Complete`)
    
    // Reload to get fresh data with migrations applied
    connections = await getAllConnections()

    // Auto-initialize predefined connections if none exist
    if (connections.length === 0) {
      console.log("[v0] [API] No connections found, auto-initializing predefined connections...")
      
      for (const predefined of CONNECTION_PREDEFINITIONS) {
        try {
          const shouldBeOnDashboard = DASHBOARD_AUTO_INSERTED.includes(predefined.exchange)
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
            is_enabled_dashboard: false, // Not active by default
            is_dashboard_inserted: shouldBeOnDashboard ? "1" : "0", // Only bybit/bingx on dashboard
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
          console.log(`[v0] [API] Auto-created predefined connection: ${predefined.name} (dashboard_inserted=${shouldBeOnDashboard})`)
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

    // Log what we're returning
    const bybitBingx = connections.filter(c => ["bybit", "bingx"].includes((c.exchange || "").toLowerCase()))
    console.log(`[v0] [API] Returning ${connections.length} total connections. Bybit/BingX dashboard_inserted:`, 
      bybitBingx.map(c => ({ name: c.name, is_dashboard_inserted: c.is_dashboard_inserted })))
    
    return NextResponse.json({ success: true, count: connections.length, connections }, { headers })
  } catch (error) {
    console.error("[v0] Error fetching connections:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ success: false, error: "Failed to fetch connections", connections: [] }, { status: 500, headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    }})
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
