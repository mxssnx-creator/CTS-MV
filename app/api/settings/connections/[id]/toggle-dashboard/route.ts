import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"

// POST toggle connection dashboard status (inserted/active) - INDEPENDENT from Settings
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const body = await request.json()
    
    // Support both dashboard fields:
    // - is_dashboard_inserted: whether connection appears on dashboard
    // - is_enabled_dashboard: whether connection is active/enabled on dashboard
    const { is_dashboard_inserted, is_enabled_dashboard } = body

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Build update object with only provided fields
    const updatedConnection = {
      ...connection,
      updated_at: new Date().toISOString(),
    }
    
    if (is_dashboard_inserted !== undefined) {
      updatedConnection.is_dashboard_inserted = is_dashboard_inserted
    }
    if (is_enabled_dashboard !== undefined) {
      updatedConnection.is_enabled_dashboard = is_enabled_dashboard
    }

    await updateConnection(connectionId, updatedConnection)

    return NextResponse.json({
      success: true,
      connection: {
        id: connectionId,
        name: connection.name,
        is_dashboard_inserted: updatedConnection.is_dashboard_inserted,
        is_enabled_dashboard: updatedConnection.is_enabled_dashboard,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update dashboard status", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
