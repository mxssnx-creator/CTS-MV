import { NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    
    if (!client) {
      return NextResponse.json({ error: "Redis client not available" }, { status: 500 })
    }
    
    // Get all connection IDs from Redis
    const connIds = await client.smembers("connections")
    console.log(`[v0] [DebugRedis] Connection IDs in Redis: ${connIds.length}`)
    
    const connections: any[] = []
    for (const id of connIds) {
      const data = await client.hgetall(`connection:${id}`)
      connections.push({
        id,
        name: data.name,
        exchange: data.exchange,
        is_predefined: data.is_predefined,
        is_enabled_dashboard: data.is_enabled_dashboard,
        data_keys: Object.keys(data),
      })
    }
    
    return NextResponse.json({
      connections_count: connIds.length,
      connections,
      redis_keys: {
        connections_set: connIds,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
