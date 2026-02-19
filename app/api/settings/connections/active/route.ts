import { NextResponse } from "next/server"
import { initRedis, getAllConnections } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const allConnections = await getAllConnections()
    
    console.log(`[v0] [Active] Total connections available: ${allConnections.length}`)
    
    // Active connections = ONLY connections that are BOTH inserted AND enabled
    // These are the only ones that can be processed by the engine
    const activeConnections = allConnections.filter((c: any) => {
      const isInserted = c.is_inserted === "1" || c.is_inserted === true || c.is_inserted === 1
      const isEnabled = c.is_enabled === "1" || c.is_enabled === true || c.is_enabled === 1
      const shouldProcess = isInserted && isEnabled
      
      if (shouldProcess) {
        console.log(`[v0] [Active] Connection ${c.id} qualifies: inserted=${isInserted}, enabled=${isEnabled}`)
      }
      
      return shouldProcess
    })
    
    console.log(`[v0] [Active] Total qualifying (inserted + enabled): ${activeConnections.length}`)
    
    return NextResponse.json({
      success: true,
      connections: activeConnections,
      total: allConnections.length,
      active: activeConnections.length,
      eligibleForEngine: activeConnections.length,
    })
  } catch (error) {
    console.error("[v0] Failed to load active connections:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load active connections", connections: [], total: 0, active: 0 },
      { status: 500 }
    )
  }
}
