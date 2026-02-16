import { NextResponse } from "next/server"
import { initRedis, getAllConnections } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const allConnections = await getAllConnections()
    
    // Active connections = connections with is_enabled_dashboard flag set
    const activeConnections = allConnections.filter((c: any) => 
      c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === true
    )
    
    console.log(`[v0] [Active] Active connections on dashboard: ${activeConnections.length} out of ${allConnections.length} total`)
    
    return NextResponse.json({
      success: true,
      connections: activeConnections,
      total: allConnections.length,
      active: activeConnections.length,
    })
  } catch (error) {
    console.error("[v0] Failed to load active connections:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load active connections", connections: [], total: 0, active: 0 },
      { status: 500 }
    )
  }
}
