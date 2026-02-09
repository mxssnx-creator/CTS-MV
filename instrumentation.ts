/**
 * Application instrumentation - runs on app startup
 * Initializes database and runs migrations automatically in background
 */

export async function register() {
  console.log("[v0] CTS v3.2 - Initializing application")
  
  // Run initialization asynchronously in background (completely non-blocking)
  setImmediate(async () => {
    try {
      // Initialize Redis with graceful fallback to memory store
      try {
        const { initRedis } = await import("@/lib/redis-db")
        await initRedis()
      } catch (error) {
        console.log("[v0] Database initialization: Using in-memory fallback")
      }

      // Run migrations in background (optional)
      try {
        const { runMigrations } = await import("@/lib/redis-migrations")
        await runMigrations()
      } catch (error) {
        // Migrations are optional, continue regardless
      }

      console.log("[v0] Application ready")
    } catch (error) {
      // Never crash startup - app continues regardless
      console.warn("[v0] Background initialization notice:", error instanceof Error ? error.message : "unknown")
    }
  })
}
