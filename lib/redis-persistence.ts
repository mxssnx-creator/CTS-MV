/**
 * Redis Persistence Manager (In-Memory Only)
 * Keeps data in memory during the deployment lifetime.
 * Data resets on redeploy (normal for Vercel), persists within a deployment.
 */

export class RedisPersistenceManager {
  /**
   * No-op save - data stays in memory
   */
  static async saveSnapshot(redisStore: Map<string, any>): Promise<void> {
    // In-memory only: data persists during deployment
    const size = redisStore.size
    if (size > 0) {
      console.log(`[v0] [Persistence] In-memory store: ${size} keys`)
    }
  }

  /**
   * No-op load - start fresh each deployment
   */
  static async loadSnapshot(): Promise<Map<string, any> | null> {
    console.log("[v0] [Persistence] Starting fresh in-memory store (no persistence across restarts)")
    return null
  }

  /**
   * Schedule periodic save (logging only)
   */
  static startPeriodicSnapshots(redisStore: Map<string, any>, intervalMs: number = 240000): void {
    setInterval(() => {
      const size = redisStore.size
      if (size > 0) {
        console.log(`[v0] [Persistence] In-memory store active: ${size} keys`)
      }
    }, intervalMs)

    console.log(`[v0] [Persistence] In-memory mode enabled - snapshots every ${(intervalMs / 1000 / 60).toFixed(1)}min (logging only)`)
  }
}
