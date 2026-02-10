/**
 * Application instrumentation - runs on app startup
 * Initializes Redis, runs migrations, and starts trade engine
 */

export async function register() {
  console.log("[v0] CTS v3.2 - Initializing application")

  try {
    // Initialize Redis with graceful fallback to memory store
    try {
      const { initRedis } = await import("@/lib/redis-db")
      await initRedis()
    } catch (error) {
      console.log("[v0] Database initialization: Using in-memory fallback")
    }

    // Run migrations
    try {
      const { runMigrations } = await import("@/lib/redis-migrations")
      await runMigrations()
    } catch (error) {
      // Migrations are optional, continue regardless
    }

    console.log("[v0] Application ready")

    // Initialize trade engine systems (only in Node.js runtime)
    if (process.env.NEXT_RUNTIME === "nodejs") {
      try {
        const { getConnectionManager } = await import("@/lib/connection-manager")
        const manager = getConnectionManager()
        const connections = manager.getConnections()
        console.log(`[v0] ConnectionManager initialized with ${connections.length} connections`)

        const { initializeGlobalCoordinator } = await import("@/lib/trade-engine")
        const coordinator = initializeGlobalCoordinator()
        if (coordinator) {
          console.log("[v0] GlobalTradeEngineCoordinator initialized")
        }

        const { initializeTradeEngineAutoStart } = await import("@/lib/trade-engine-auto-start")
        await initializeTradeEngineAutoStart()
        console.log("[v0] Trade engine auto-initialization complete")
      } catch (tradeError) {
        console.warn("[v0] Trade engine init skipped:", tradeError instanceof Error ? tradeError.message : "unknown")
      }
    }
  } catch (error) {
    // Never crash startup
    console.warn("[v0] Initialization notice:", error instanceof Error ? error.message : "unknown")
  }
}
