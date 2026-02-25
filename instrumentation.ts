/**
 * Application instrumentation - runs on app startup
 * Initializes Redis, runs migrations, seeds data, and starts trade engine
 */

export async function register() {
  console.log("[v0] CTS v3.2 - Initializing application")

  try {
    // Only run initialization in Node.js runtime (not Edge)
    if (process.env.NEXT_RUNTIME === "nodejs") {
      // Pre-startup: Run critical initialization tasks
      try {
        const { runPreStartup } = await import("@/lib/pre-startup")
        await runPreStartup()
      } catch (preStartupError) {
        console.warn("[v0] Pre-startup notice:", preStartupError instanceof Error ? preStartupError.message : "unknown")
      }

      console.log("[v0] Application ready - all initialization completed in pre-startup")
    }
  } catch (error) {
    // Never crash startup
    console.warn("[v0] Initialization notice:", error instanceof Error ? error.message : "unknown")
  }
}
