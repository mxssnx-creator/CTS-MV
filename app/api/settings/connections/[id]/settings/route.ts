import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { updateConnection, initRedis, getAllConnections, getConnection } from "@/lib/redis-db"
import { RedisTrades, RedisPositions } from "@/lib/redis-operations"

// GET connection-specific settings with comprehensive data
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id

    await initRedis()

    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const activeTrades = await RedisTrades.getTradesByConnection(connectionId)
    const activePositions = await RedisPositions.getPositionsByConnection(connectionId)

    const settings = connection.connection_settings
      ? typeof connection.connection_settings === "string"
        ? JSON.parse(connection.connection_settings)
        : connection.connection_settings
      : {}

    const responseData = {
      connection: {
        id: connection.id,
        name: connection.name,
        exchange: connection.exchange,
        api_type: connection.api_type,
        connection_method: connection.connection_method,
        connection_library: connection.connection_library,
        margin_type: connection.margin_type,
        position_mode: connection.position_mode,
        is_testnet: connection.is_testnet,
        is_enabled: connection.is_enabled,
        is_active: connection.is_active,
        volume_factor: connection.volume_factor,
      },
      settings,
      statistics: {
        active_trades: activeTrades?.length || 0,
        active_positions: activePositions?.length || 0,
        created_at: connection.created_at,
        updated_at: connection.updated_at,
      },
    }

    await SystemLogger.logAPI(
      `Retrieved settings for connection ${connectionId}`,
      "info",
      `GET /api/settings/connections/${connectionId}/settings`
    )

    return NextResponse.json(responseData)
  } catch (error) {
    console.error("[v0] [Settings] Exception in GET:", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    await SystemLogger.logError(error, "api", "GET /api/settings/connections/[id]/settings")
    return NextResponse.json({ error: "Failed to fetch settings", details: errorMsg }, { status: 500 })
  }
}

// PUT update connection settings (full replace)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const body = await request.json()

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const updatedConnection = {
      ...connection,
      name: body.name || connection.name,
      api_type: body.api_type || connection.api_type,
      connection_method: body.connection_method || connection.connection_method,
      connection_library: body.connection_library || connection.connection_library,
      margin_type: body.margin_type || connection.margin_type,
      position_mode: body.position_mode || connection.position_mode,
      is_testnet: body.is_testnet !== undefined ? body.is_testnet : connection.is_testnet,
      is_enabled: body.is_enabled !== undefined ? body.is_enabled : connection.is_enabled,
      is_active: body.is_active !== undefined ? body.is_active : connection.is_active,
      volume_factor: body.volume_factor || connection.volume_factor,
      connection_settings: body.settings || connection.connection_settings,
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)
    await SystemLogger.logConnection(`Updated connection settings`, connectionId, "info")

    return NextResponse.json({ success: true, connection: updatedConnection })
  } catch (error) {
    console.error("[v0] [Settings] Exception in PUT:", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    await SystemLogger.logError(error, "api", "PUT /api/settings/connections/[id]/settings")
    return NextResponse.json({ error: "Failed to update settings", details: errorMsg }, { status: 500 })
  }
}

// PATCH update connection settings (partial)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const settings = await request.json()

    console.log("[v0] [Settings] PATCH updating connection settings:", connectionId, settings)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const currentSettings = connection.connection_settings
      ? typeof connection.connection_settings === "string"
        ? JSON.parse(connection.connection_settings)
        : connection.connection_settings
      : {}

    const mergedSettings = { ...currentSettings, ...settings }

    const updatedConnection = {
      ...connection,
      connection_settings: mergedSettings,
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)
    console.log("[v0] [Settings] Connection settings patched successfully")
    await SystemLogger.logConnection(`Patched connection settings`, connectionId, "info")

    return NextResponse.json({ success: true, settings: mergedSettings })
  } catch (error) {
    console.error("[v0] [Settings] Exception in PATCH:", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    await SystemLogger.logError(error, "api", "PATCH /api/settings/connections/[id]/settings")
    return NextResponse.json({ error: "Failed to update settings", details: errorMsg }, { status: 500 })
  }
}
