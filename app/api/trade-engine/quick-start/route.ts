import { NextResponse } from "next/server"
import { getAllConnections, initRedis, updateConnection } from "@/lib/redis-db"
import { API_VERSIONS } from "@/lib/system-version"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const API_VERSION = API_VERSIONS.tradeEngine

/**
 * POST /api/trade-engine/quick-start
 * Quick-start endpoint: enables BingX connection (or bybit as fallback) on dashboard
 * Useful for testing when no connections are actively enabled
 * BingX is preferred as it has proven API key validation in production
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || "enable"
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: Action=${action}`)
    
    await initRedis()
    const allConnections = await getAllConnections()
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: Checking ${allConnections.length} connections`)
    
    // Find ANY BingX connection first (regardless of dashboard status), fallback to bybit
    const connection = allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      return exch === "bingx"
    }) || allConnections.find((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      return exch === "bybit"
    })
    
    if (!connection) {
      console.log(`[v0] [QuickStart] ${API_VERSION}: ✗ No BingX/Bybit connections found`)
      return NextResponse.json(
        { 
          success: false,
          error: "No BingX/Bybit connections found",
          availableConnections: allConnections.map((c: any) => ({ 
            name: c.name, 
            exchange: c.exchange
          }))
        },
        { status: 404 }
      )
    }
    
    console.log(`[v0] [QuickStart] ${API_VERSION}: Found ${connection.name} (${connection.exchange})`)
    
    if (action === "disable") {
      // DISABLE: Clear both dashboard fields
      console.log(`[v0] [QuickStart] ${API_VERSION}: Disabling ${connection.name}...`)
      const disabled = {
        ...connection,
        is_dashboard_inserted: "0",
        is_enabled_dashboard: "0",
        updated_at: new Date().toISOString(),
      }
      await updateConnection(connection.id, disabled)
      console.log(`[v0] [QuickStart] ${API_VERSION}: ✓ Disabled ${connection.name}`)
      return NextResponse.json({
        success: true,
        action: "disable",
        connection: {
          id: connection.id,
          name: connection.name,
          exchange: connection.exchange,
        },
        version: API_VERSION,
      })
    } else {
      // ENABLE: Set both dashboard fields (default action)
      console.log(`[v0] [QuickStart] ${API_VERSION}: Enabling ${connection.name}...`)
      const enabled = {
        ...connection,
        is_dashboard_inserted: "1",
        is_enabled_dashboard: "1",
        updated_at: new Date().toISOString(),
      }
      await updateConnection(connection.id, enabled)
      console.log(`[v0] [QuickStart] ${API_VERSION}: ✓ Enabled ${connection.name}`)
      return NextResponse.json({
        success: true,
        action: "enable",
        connection: {
          id: connection.id,
          name: connection.name,
          exchange: connection.exchange,
          is_enabled_dashboard: "1",
        },
        version: API_VERSION,
      })
    }
  } catch (error) {
    console.error(`[v0] [QuickStart] ${API_VERSION}: Error:`, error)
    return NextResponse.json(
      { error: "Quick start failed", details: error instanceof Error ? error.message : "Unknown error", version: API_VERSION },
      { status: 500 }
    )
  }
}
