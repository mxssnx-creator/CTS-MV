import { NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"

export async function POST(request: Request) {
  try {
    const { connectionId, hoursToKeep } = await request.json()

    if (!connectionId || !hoursToKeep) {
      return NextResponse.json({ error: "connectionId and hoursToKeep are required" }, { status: 400 })
    }

    await initRedis()
    const client = getRedisClient()

    // Calculate cutoff timestamp
    const cutoffTime = new Date(Date.now() - hoursToKeep * 60 * 60 * 1000)
    const cutoffTimeStr = cutoffTime.toISOString()

    // Get all market data keys for this connection
    const keys = await (client as any).keys(`market_data:${connectionId}:*`)
    let deletedCount = 0

    for (const key of keys) {
      const data = await (client as any).hGetAll(key)
      
      // Check if this record is older than cutoff
      if (data.timestamp && new Date(data.timestamp) < cutoffTime) {
        // Archive to another key first
        const archiveKey = `archived_market_data:${connectionId}:${data.symbol || "unknown"}:${Date.now()}`
        const fields = Object.entries(data).flat()
        await (client as any).hSet(archiveKey, ...fields)
        await (client as any).expire(archiveKey, 90 * 24 * 60 * 60) // Keep archived for 90 days
        
        // Delete original
        await (client as any).del(key)
        deletedCount++
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
    })
  } catch (error) {
    console.error("[v0] Error cleaning up historical data:", error)
    return NextResponse.json({ error: "Failed to cleanup historical data" }, { status: 500 })
  }
}
