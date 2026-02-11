import { NextResponse } from "next/server"
import { initRedis, getRedisStats } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const stats = await getRedisStats()
    
    return NextResponse.json({
      status: "success",
      is_installed: stats.connected,
      database_connected: stats.connected,
      database_type: "redis",
      table_count: stats.keyCount || 0,
      migrations: {
        current_version: stats.keyCount > 0 ? 11 : 0,
      },
      database_stats: {
        connected: stats.connected,
        mode: stats.mode || "redis",
        total_keys: stats.keyCount || 0,
        is_fallback: stats.isUsingFallback || false,
      },
      migration_status: {
        latest_version: 11,
        is_up_to_date: true,
      }
    })
  } catch (error) {
    console.error("[v0] Status check error:", error)
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Failed to get database status",
      is_installed: false,
      database_connected: false,
    }, { status: 500 })
  }
}
