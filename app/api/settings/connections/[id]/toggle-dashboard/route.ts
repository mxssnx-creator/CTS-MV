import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"

// POST toggle connection active status (inserted/enabled) - INDEPENDENT from Settings
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const body = await request.json()
    
    // Support both active fields:
    // - is_active_inserted: whether connection appears in active list
    // - is_enabled_dashboard: whether connection is enabled/active
    const { is_active_inserted, is_enabled_dashboard } = body

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      console.log(`[v0] [Toggle] ✗ Connection not found: ${connectionId}`)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    console.log(`[v0] [Toggle] Toggling ${connection.name} (${connectionId}):`)
    console.log(`[v0] [Toggle]   Before: is_active_inserted=${connection.is_active_inserted}, is_enabled_dashboard=${connection.is_enabled_dashboard}`)

    // Build update object with only provided fields
    const updatedConnection = {
      ...connection,
      updated_at: new Date().toISOString(),
    }
    
    if (is_active_inserted !== undefined) {
      updatedConnection.is_active_inserted = is_active_inserted
      console.log(`[v0] [Toggle]   Setting is_active_inserted=${is_active_inserted} (permanent removal/addition)`)
    }
    if (is_enabled_dashboard !== undefined) {
      updatedConnection.is_enabled_dashboard = is_enabled_dashboard
      console.log(`[v0] [Toggle]   Setting is_enabled_dashboard=${is_enabled_dashboard} (active state)`)
    }

    console.log(`[v0] [Toggle]   After: is_active_inserted=${updatedConnection.is_active_inserted}, is_enabled_dashboard=${updatedConnection.is_enabled_dashboard}`)

    await updateConnection(connectionId, updatedConnection)
    
    console.log(`[v0] [Toggle] ✓ Updated ${connection.name}`)

    return NextResponse.json({
      success: true,
      connection: {
        id: connectionId,
        name: connection.name,
        is_active_inserted: updatedConnection.is_active_inserted,
        is_enabled_dashboard: updatedConnection.is_enabled_dashboard,
      },
    })
  } catch (error) {
    console.error(`[v0] [Toggle] ✗ Error:`, error)
    return NextResponse.json(
      { error: "Failed to update active status", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
