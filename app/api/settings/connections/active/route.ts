import { NextResponse } from "next/server"
import { initRedis, getAllConnections } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const allConnections = await getAllConnections()
    
    console.log(`[v0] [Active] Total connections available: ${allConnections.length}`)
    
    // Active connections = connections with is_enabled_dashboard flag set to show them on dashboard
    const activeConnections = allConnections.filter((c: any) => {
      const isDashboard = c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === true || c.is_enabled_dashboard === 1
      return isDashboard
    })
    
    // Also include all inserted connections (even if not yet enabled dashboard)
    // This ensures newly added connections always show on active list
    const insertedConnections = allConnections.filter((c: any) => {
      const isInserted = c.is_inserted === "1" || c.is_inserted === true || c.is_inserted === 1
      const notAlreadyActive = !activeConnections.find(ac => ac.id === c.id)
      return isInserted && notAlreadyActive
    })
    
    const finalActive = [...activeConnections, ...insertedConnections]
    
    console.log(`[v0] [Active] Dashboard-enabled: ${activeConnections.length}, Inserted (not yet enabled): ${insertedConnections.length}, Total active: ${finalActive.length}`)
    
    return NextResponse.json({
      success: true,
      connections: finalActive,
      total: allConnections.length,
      active: finalActive.length,
      dashboard_enabled: activeConnections.length,
      inserted_not_enabled: insertedConnections.length,
    })
  } catch (error) {
    console.error("[v0] Failed to load active connections:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load active connections", connections: [], total: 0, active: 0 },
      { status: 500 }
    )
  }
}
