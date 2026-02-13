import { type NextRequest, NextResponse } from "next/server"
import { getAllConnections, createConnection, initRedis } from "@/lib/redis-db"

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
    console.log("[v0] GET /api/settings/connections - Loading connections...")
    const { searchParams } = new URL(request.url)

    const exchange = searchParams.get("exchange")
    const enabled = searchParams.get("enabled")
    const active = searchParams.get("active")

    // Load connections from Redis
    await initRedis()
    let connections = await getAllConnections() || []
    console.log(`[v0] Loaded ${connections.length} connections from Redis`)

    // Apply filters
    if (exchange) {
      connections = connections.filter((c) => c.exchange?.toLowerCase() === exchange.toLowerCase())
    }
    if (enabled === "true") {
      connections = connections.filter((c) => c.is_enabled === true)
    }
    if (active === "true") {
      connections = connections.filter((c) => c.is_active === true)
    }

    // Format response
    const formatted = connections.map((conn) => ({
      ...conn,
      exchange_id: EXCHANGE_NAME_TO_ID[conn.exchange?.toLowerCase() as string] || null,
    }))

    return NextResponse.json({
      success: true,
      count: formatted.length,
      connections: formatted,
    })
  } catch (error) {
    console.error("[v0] Error in GET /api/settings/connections:", error)
    return NextResponse.json({
      success: true,
      count: 0,
      connections: [],
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("[v0] POST /api/settings/connections - Creating:", body.name)

    if (!body.name || !body.exchange) {
      return NextResponse.json(
        { error: "Missing name or exchange" },
        { status: 400 }
      )
    }

    if (!body.api_key || !body.api_secret) {
      return NextResponse.json(
        { error: "Missing API credentials" },
        { status: 400 }
      )
    }

    // Create new connection
    await initRedis()
    const newConnection = {
      id: `${body.exchange}-${body.name}`.toLowerCase().replace(/\s+/g, "-"),
      name: body.name,
      exchange: body.exchange.toLowerCase(),
      api_key: body.api_key,
      api_secret: body.api_secret,
      api_type: body.api_type || "perpetual_futures",
      connection_method: "rest",
      connection_library: "native",
      margin_type: body.margin_type || "cross",
      position_mode: body.position_mode || "hedge",
      is_testnet: body.is_testnet || false,
      is_enabled: true,
      is_active: true,
      is_predefined: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await createConnection(newConnection)
    console.log("[v0] Connection created:", newConnection.id)

    return NextResponse.json({
      success: true,
      id: newConnection.id,
      message: "Connection created successfully",
    })
  } catch (error) {
    console.error("[v0] Error in POST /api/settings/connections:", error)
    return NextResponse.json(
      { error: "Failed to create connection" },
      { status: 500 }
    )
  }
}
