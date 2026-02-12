import { type NextRequest, NextResponse } from "next/server"
import { getConnection, updateConnection, initRedis } from "@/lib/redis-db"

// GET connection-specific settings
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Parse settings or return defaults
    const settings = connection.connection_settings
      ? typeof connection.connection_settings === "string"
        ? JSON.parse(connection.connection_settings)
        : connection.connection_settings
      : {
          baseVolumeFactorLive: 1.0,
          baseVolumeFactorPreset: 1.0,
          profitFactorMinBase: 0.6,
          profitFactorMinMain: 0.6,
          profitFactorMinReal: 0.6,
          trailingWithTrailing: true,
          trailingOnly: false,
          blockEnabled: true,
          blockOnly: false,
          dcaEnabled: false,
          dcaOnly: false,
        }

    return NextResponse.json(settings)
  } catch (error) {
    console.error("[v0] Failed to fetch connection settings:", error)
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

// PATCH update connection-specific settings
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const settings = await request.json()

    console.log("[v0] Saving connection settings for:", connectionId, settings)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Update connection settings
    const updatedConnection = {
      ...connection,
      connection_settings: settings,
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to update connection settings:", error)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
