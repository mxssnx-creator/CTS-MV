import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * GET /api/system/init-status
 * Returns the current system initialization status
 * Used by frontend to determine if migrations have completed and system is ready
 */
export async function GET(request: NextRequest) {
  try {
    const { initRedis, isRedisConnected, getRedisStats, getAllConnections } = await import("@/lib/redis-db")
    const { getMigrationStatus } = await import("@/lib/redis-migrations")

    // Try to connect to Redis
    await initRedis()
    const connected = await isRedisConnected()

    if (!connected) {
      return NextResponse.json(
        {
          status: "error",
          initialized: false,
          message: "Redis not connected",
          database: "redis",
          ready: false,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      )
    }

    // Get migration status
    const migrationStatus = await getMigrationStatus()
    const stats = await getRedisStats()

    // Get connection count
    let connectionsCount = 0
    let enabledConnectionsCount = 0
    
    try {
      const connections = await getAllConnections()
      connectionsCount = connections.length
      enabledConnectionsCount = connections.filter((c: any) => c.is_enabled !== false).length
    } catch (error) {
      console.warn("[v0] Failed to get connections count:", error)
    }

    const initialized =
      connected && migrationStatus.currentVersion === migrationStatus.latestVersion
    const ready = initialized && connectionsCount > 0

    return NextResponse.json(
      {
        status: initialized ? "ready" : "initializing",
        initialized,
        ready,
        message: initialized ? "System ready" : "Migrations in progress",
        database: {
          type: "redis",
          connected,
        },
        migrations: {
          current_version: migrationStatus.currentVersion,
          latest_version: migrationStatus.latestVersion,
          up_to_date: migrationStatus.currentVersion === migrationStatus.latestVersion,
        },
        connections: {
          total: connectionsCount,
          enabled: enabledConnectionsCount,
        },
        statistics: {
          total_keys: stats.keyCount || stats.total_keys || stats.dbSize || 0,
          memory_used: stats.memory_used || "N/A",
          uptime_seconds: stats.uptime_seconds || stats.uptimeSeconds || 0,
        },
        system: {
          version: "3.2",
          environment: process.env.NODE_ENV || "development",
          timestamp: new Date().toISOString(),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[v0] Init status check failed:", error)

    return NextResponse.json(
      {
        status: "error",
        initialized: false,
        ready: false,
        message: error instanceof Error ? error.message : "Unknown error",
        database: {
          type: "redis",
          connected: false,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
