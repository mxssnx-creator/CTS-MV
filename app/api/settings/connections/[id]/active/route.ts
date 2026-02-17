import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"

// POST - Add connection to active connections (set is_enabled_dashboard flag)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id

    console.log("[v0] Adding connection to active:", connectionId)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Update connection to be active on dashboard
    const updatedConnection = {
      ...connection,
      is_enabled_dashboard: "1",
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)

    console.log("[v0] Connection added to active connections:", connectionId)
    await SystemLogger.logConnection("Added to active connections", connectionId, "info")

    return NextResponse.json({
      success: true,
      connection: updatedConnection,
      message: "Connection added to active connections",
    })
  } catch (error) {
    console.error("[v0] Failed to add connection to active:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/active")
    return NextResponse.json(
      { error: "Failed to add connection to active", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// DELETE - Remove connection from active connections
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id

    console.log("[v0] Removing connection from active:", connectionId)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Update connection to remove from active
    const updatedConnection = {
      ...connection,
      is_enabled_dashboard: "0",
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)

    console.log("[v0] Connection removed from active connections:", connectionId)
    await SystemLogger.logConnection("Removed from active connections", connectionId, "info")

    return NextResponse.json({
      success: true,
      connection: updatedConnection,
      message: "Connection removed from active connections",
    })
  } catch (error) {
    console.error("[v0] Failed to remove connection from active:", error)
    await SystemLogger.logError(error, "api", "DELETE /api/settings/connections/[id]/active")
    return NextResponse.json(
      { error: "Failed to remove connection from active", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
