"use client"

/**
 * DatabaseInitAlert - No longer needed.
 * The Redis-based system initializes automatically via instrumentation.ts -> pre-startup.ts.
 * All 15 migrations, connections, market data, and settings are seeded at server startup.
 * No manual database initialization is required.
 */
export function DatabaseInitAlert() {
  return null
}
