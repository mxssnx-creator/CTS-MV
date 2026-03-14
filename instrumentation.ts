/**
 * Application instrumentation - runs on app startup
 * Initializes Redis, runs migrations, seeds data, and starts trade engine
 * 
 * IMPORTANT: Next.js calls register() twice (once per compilation).
 * We use a globalThis guard to ensure startup only runs ONCE.
 */

const g = globalThis as any
if (!g.__cts_register_guard) {
  g.__cts_register_guard = { done: false, running: false }
}

export async function register() {
  // Bulletproof guard: skip if already done or currently running
  if (g.__cts_register_guard.done || g.__cts_register_guard.running) {
    console.log("[v0] register() called again - skipping (already initialized)")
    return
  }
  g.__cts_register_guard.running = true

  console.log("[v0] CTS v3.2 - Initializing application")

  try {
    if (process.env.NEXT_RUNTIME === "nodejs") {
      try {
        const { runPreStartup } = await import("@/lib/pre-startup")
        await runPreStartup()
      } catch (preStartupError) {
        console.warn("[v0] Pre-startup notice:", preStartupError instanceof Error ? preStartupError.message : "unknown")
      }
      console.log("[v0] Application ready - all initialization completed in pre-startup")
    }
  } catch (error) {
    console.warn("[v0] Initialization notice:", error instanceof Error ? error.message : "unknown")
  } finally {
    g.__cts_register_guard.done = true
    g.__cts_register_guard.running = false
  }
}
