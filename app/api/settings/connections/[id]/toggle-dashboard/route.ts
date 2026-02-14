import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"

// POST toggle connection dashboard enabled status (independent from trade engine)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const body = await request.json()
    const { is_enabled_dashboard } = body

    console.log("[v0] [Dashboard Toggle] Toggling dashboard status for:", connectionId, "enabled:", is_enabled_dashboard)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      console.error("[v0] [Dashboard Toggle] Connection not found:", connectionId)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Update only the dashboard enabled status, leaving is_enabled unchanged
    const updatedConnection = {
      ...connection,
      is_enabled_dashboard,
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)
    console.log("[v0] [Dashboard Toggle] Dashboard status updated:", {
      connectionId,
      is_enabled_dashboard,
      is_enabled: connection.is_enabled, // Unchanged
    })

    return NextResponse.json({
      success: true,
      message: `Connection ${is_enabled_dashboard ? "shown" : "hidden"} on dashboard`,
      connection: {
        id: connectionId,
        name: connection.name,
        is_enabled: connection.is_enabled,
        is_enabled_dashboard,
      },
    })
  } catch (error) {
    console.error("[v0] [Dashboard Toggle] Error:", error)
    return NextResponse.json(
      { error: "Failed to toggle dashboard status", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
