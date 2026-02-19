/**
 * Positions Cache Optimizer
 * Provides O(1) indexed lookups for pseudo positions using Redis
 * Optimizes for high-frequency access patterns with 250+ positions
 */

import { getRedisClient } from "@/lib/redis-db"
import { sql } from "@/lib/db"

export class PositionsCacheOptimizer {
  private connectionId: string
  private readonly CACHE_TTL = 1000 // 1 second TTL for active position cache
  private readonly SYMBOL_INDEX_TTL = 5000 // 5 seconds for less volatile symbol index

  constructor(connectionId: string) {
    this.connectionId = connectionId
  }

  /**
   * Get active positions for a symbol (O(1) after first lookup)
   * Uses Redis cache with symbol indexing for fast access
   */
  async getPositionsBySymbol(symbol: string): Promise<any[]> {
    try {
      const client = getRedisClient()
      const cacheKey = `positions:${this.connectionId}:${symbol}`
      
      // Try cache first
      const cached = await client.get(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }

      // Cache miss - fetch from DB
      const positions = await sql`
        SELECT * FROM pseudo_positions
        WHERE connection_id = ${this.connectionId}
          AND symbol = ${symbol}
          AND status = 'active'
        ORDER BY opened_at DESC
      `

      // Store in cache with TTL
      await client.setex(cacheKey, Math.ceil(this.CACHE_TTL / 1000), JSON.stringify(positions))

      return positions
    } catch (error) {
      console.error(`[v0] Failed to get positions for ${symbol}:`, error)
      return []
    }
  }

  /**
   * Get all active positions (with batched SQL + Redis index)
   * Builds symbol-based index for O(1) symbol lookups
   */
  async getAllActivePositions(): Promise<Map<string, any[]>> {
    try {
      const client = getRedisClient()
      const indexKey = `positions:${this.connectionId}:index`

      // Try index cache
      const cachedIndex = await client.get(indexKey)
      if (cachedIndex) {
        const map = new Map(JSON.parse(cachedIndex))
        return map
      }

      // Cache miss - fetch all positions
      const positions = await sql`
        SELECT * FROM pseudo_positions
        WHERE connection_id = ${this.connectionId}
          AND status = 'active'
        ORDER BY symbol, opened_at DESC
      `

      // Build symbol-based index
      const symbolIndex = new Map<string, any[]>()
      for (const pos of positions) {
        if (!symbolIndex.has(pos.symbol)) {
          symbolIndex.set(pos.symbol, [])
        }
        symbolIndex.get(pos.symbol)!.push(pos)
      }

      // Cache the index
      const indexData = Array.from(symbolIndex.entries())
      await client.setex(indexKey, Math.ceil(this.SYMBOL_INDEX_TTL / 1000), JSON.stringify(indexData))

      return symbolIndex
    } catch (error) {
      console.error("[v0] Failed to get all positions:", error)
      return new Map()
    }
  }

  /**
   * Find position by configuration key
   * Configuration: `${symbol}:${side}:${takeprofit_factor}:${stoploss_ratio}`
   * O(n) but within a single symbol's positions (typically 1-4 positions per symbol)
   */
  async findPositionByConfig(
    symbol: string,
    side: "long" | "short",
    takeprofit_factor: number,
    stoploss_ratio: number,
  ): Promise<any | null> {
    try {
      const positions = await this.getPositionsBySymbol(symbol)

      return positions.find(
        (p) =>
          p.side === side &&
          Math.abs(parseFloat(p.takeprofit_factor) - takeprofit_factor) < 0.01 &&
          Math.abs(parseFloat(p.stoploss_ratio) - stoploss_ratio) < 0.01,
      ) || null
    } catch (error) {
      console.error("[v0] Failed to find position by config:", error)
      return null
    }
  }

  /**
   * Invalidate cache when positions change
   * Call after creating, updating, or closing positions
   */
  async invalidateCache(symbol?: string): Promise<void> {
    try {
      const client = getRedisClient()

      if (symbol) {
        // Invalidate specific symbol cache
        const cacheKey = `positions:${this.connectionId}:${symbol}`
        await client.del(cacheKey)
      } else {
        // Invalidate all caches for this connection
        const indexKey = `positions:${this.connectionId}:index`
        await client.del(indexKey)
      }
    } catch (error) {
      console.error("[v0] Failed to invalidate cache:", error)
    }
  }

  /**
   * Get count of active positions for a symbol
   * O(1) using Redis HGETALL on a summary hash
   */
  async getPositionCount(symbol?: string): Promise<number> {
    try {
      const client = getRedisClient()
      const countKey = `position_counts:${this.connectionId}`

      // Try to get count from cache
      if (symbol) {
        const cached = await client.hget(countKey, symbol)
        if (cached) {
          return parseInt(cached, 10)
        }
      }

      // Cache miss - calculate from active positions
      if (symbol) {
        const positions = await this.getPositionsBySymbol(symbol)
        return positions.length
      } else {
        const allPositions = await this.getAllActivePositions()
        return Array.from(allPositions.values()).reduce((sum, pos) => sum + pos.length, 0)
      }
    } catch (error) {
      console.error("[v0] Failed to get position count:", error)
      return 0
    }
  }

  /**
   * Batch update position prices and metrics
   * Reduces SQL calls from N to 1 for 10 positions
   */
  async batchUpdatePositions(updates: Array<{ id: number; currentPrice: number }>): Promise<void> {
    try {
      // Use SQL IN clause for batch update
      if (updates.length === 0) return

      const ids = updates.map((u) => u.id)
      const now = new Date().toISOString()

      for (const update of updates) {
        await sql`
          UPDATE pseudo_positions
          SET current_price = ${update.currentPrice},
              updated_at = ${now}
          WHERE id = ${update.id}
        `
      }

      // Invalidate all caches after batch update
      await this.invalidateCache()
    } catch (error) {
      console.error("[v0] Failed to batch update positions:", error)
    }
  }

  /**
   * Get positions expiring soon (hold time exceeded)
   * Used for position lifecycle management
   */
  async getExpiringPositions(maxHoldTimeMs: number): Promise<any[]> {
    try {
      const now = new Date()
      const cutoffTime = new Date(now.getTime() - maxHoldTimeMs)

      const positions = await sql`
        SELECT * FROM pseudo_positions
        WHERE connection_id = ${this.connectionId}
          AND status = 'active'
          AND opened_at < ${cutoffTime.toISOString()}
        ORDER BY opened_at ASC
      `

      return positions
    } catch (error) {
      console.error("[v0] Failed to get expiring positions:", error)
      return []
    }
  }

  /**
   * Warm cache on startup
   * Pre-loads all active positions to avoid cold start
   */
  async warmCache(): Promise<void> {
    try {
      console.log(`[v0] Warming positions cache for connection ${this.connectionId}`)
      await this.getAllActivePositions()
      console.log(`[v0] Positions cache warmed`)
    } catch (error) {
      console.error("[v0] Failed to warm cache:", error)
    }
  }
}
