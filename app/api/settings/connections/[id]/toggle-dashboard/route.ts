import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"
import { toggleConnectionLimiter } from "@/lib/connection-rate-limiter"

// POST toggle connection active status (inserted/enabled) - INDEPENDENT from Settings
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const body = await request.json()
    
    // Check rate limit using systemwide limiter
    const limitResult = await toggleConnectionLimiter.checkLimit(connectionId)
    
    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          details: `Maximum 30 toggle requests per minute. Retry after ${limitResult.retryAfter} seconds.`,
          retryAfter: limitResult.retryAfter,
          resetTime: limitResult.resetTime,
        },
        { status: 429, headers: { "Retry-After": String(limitResult.retryAfter) } }
      )
    }
    
    // Support both active fields:
    // - is_active_inserted: whether connection appears in active list
    // - is_enabled_dashboard: whether connection is enabled/active
    const { is_active_inserted, is_enabled_dashboard } = body

    await initRedis()
    let connection = await getConnection(connectionId)
    let resolvedId = connectionId

    // Fallback: try with conn- prefix if not found (handles predefined IDs like bybit-x03 → conn-bybit-x03)
    if (!connection && !connectionId.startsWith("conn-")) {
      const prefixedId = `conn-${connectionId}`
      console.log(`[v0] [Toggle] Not found with id=${connectionId}, trying conn- prefix: ${prefixedId}`)
      connection = await getConnection(prefixedId)
      if (connection) {
        resolvedId = prefixedId
        console.log(`[v0] [Toggle] Resolved to: ${resolvedId}`)
      }
    }

    if (!connection) {
      console.log(`[v0] [Toggle] ✗ Connection not found: ${connectionId} (also tried conn-${connectionId})`)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    console.log(`[v0] [Toggle] Toggling ${connection.name} (${connectionId}):`)
    console.log(`[v0] [Toggle]   Before: is_active_inserted=${connection.is_active_inserted}, is_enabled_dashboard=${connection.is_enabled_dashboard}`)
    console.log(`[v0] [Toggle]   Rate limit remaining: ${limitResult.remaining}`)

    // Build update object with all necessary fields
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
      
      // CRITICAL: When toggling on/off in dashboard, also manage is_enabled + is_inserted for engine filter
      // getInsertedAndEnabledConnections() requires BOTH is_inserted="1" AND is_enabled="1"
      if (is_enabled_dashboard) {
        // Toggle ON: Set all flags so engine's coordinator finds this connection
        updatedConnection.is_enabled = "1"        // Engine filter: is_enabled="1"
        updatedConnection.is_inserted = "1"       // Engine filter: is_inserted="1"
        updatedConnection.is_active = "1"
        console.log(`[v0] [Toggle] ✓ ENABLING: is_enabled=1, is_inserted=1 (engine will find this connection)`)
      } else {
        // Toggle OFF: Clear flags so engine stops processing
        updatedConnection.is_enabled = "0"
        updatedConnection.is_inserted = "0"
        updatedConnection.is_active = "0"
        console.log(`[v0] [Toggle] ✗ DISABLING: is_enabled=0, is_inserted=0 (engine will stop processing)`)
      }
      
      console.log(`[v0] [Toggle]   Setting is_enabled_dashboard=${is_enabled_dashboard}`)
    }

    console.log(`[v0] [Toggle]   After: is_enabled=${updatedConnection.is_enabled}, is_enabled_dashboard=${updatedConnection.is_enabled_dashboard}`)

    await updateConnection(resolvedId, updatedConnection)
    
    console.log(`[v0] [Toggle] ✓ Updated ${connection.name} (resolved id: ${resolvedId})`)

    return NextResponse.json({
      success: true,
      connection: {
        id: resolvedId,
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
