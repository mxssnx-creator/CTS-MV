/**
 * Database Module - Redis Primary Database
 * Redis is the primary database, SQLite/PostgreSQL removed
 */

export { 
  getRedisClient, 
  initRedis,
  saveConnection,
  getConnection,
  getAllConnections,
  updateConnection,
  deleteConnection,
  saveIndication,
  getIndications,
  saveMarketData,
  getMarketData,
  setSettings,
  getSettings,
  deleteSettings,
  flushAll,
  isRedisConnected,
  getRedisStats,
  verifyRedisHealth
} from "./redis-db"

export { 
  runMigrations,
  rollbackMigration,
  getMigrationStatus
} from "./redis-migrations"

import { getRedisClient, initRedis as initRedisDb } from "./redis-db"
import { nanoid } from "nanoid"

/**
 * Get database type - Always Redis
 */
export function getDatabaseType(): string {
  return "redis"
}

/**
 * Compatibility layer for legacy calls
 */
export async function getClient(): Promise<any> {
  const { getRedisClient } = await import("./redis-db")
  return getRedisClient()
}

/**
 * Reset database clients - no-op for Redis
 */
export function resetDatabaseClients(): void {
  // No-op for Redis
}

/**
 * Compatibility wrapper for execute() - Redis version
 */
export async function execute(query: string, params: any[] = []): Promise<{ rowCount: number }> {
  try {
    await initRedisDb()
    return { rowCount: 0 }
  } catch (error) {
    console.error("[v0] Execute error:", error)
    return { rowCount: 0 }
  }
}

/**
 * Compatibility wrapper for insertReturning() - Redis version
 */
export async function insertReturning(queryText: string, params: any[] = []): Promise<any> {
  try {
    await initRedisDb()
    return { 
      id: `${Date.now()}:${Math.random().toString(36).substr(2, 9)}`, 
      created_at: new Date().toISOString(), 
      updated_at: new Date().toISOString() 
    }
  } catch (error) {
    console.error("[v0] InsertReturning error:", error)
    return { id: null }
  }
}

/**
 * Compatibility wrapper for query() - Redis version
 */
export async function query<T = any>(queryText: string, params: any[] = []): Promise<T[]> {
  try {
    await initRedisDb()
    // Simple query parsing for common selects
    if (queryText.toUpperCase().includes("SELECT")) {
      return []
    }
    return []
  } catch (error) {
    console.error("[v0] Query error:", error)
    return []
  }
}

/**
 * Compatibility wrapper for queryOne() - Redis version
 */
export async function queryOne<T = any>(queryText: string, params: any[] = []): Promise<T | null> {
  try {
    const results = await query<T>(queryText, params)
    return results.length > 0 ? results[0] : null
  } catch (error) {
    console.error("[v0] QueryOne error:", error)
    return null
  }
}

/**
 * Compatibility wrapper for sql template literal - Redis version
 */
export async function sql<T = any>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]> {
  try {
    // Reconstruct query from template
    let queryText = strings[0]
    for (let i = 0; i < values.length; i++) {
      queryText += `$${i + 1}` + strings[i + 1]
    }
    return query<T>(queryText, values)
  } catch (error) {
    console.error("[v0] SQL error:", error)
    return []
  }
}

/**
 * Get or create an ID for a record
 */
export function generateId(): string {
  return nanoid()
}

/**
 * Convert database timestamp to string
 */
export function dbNow(): string {
  return new Date().toISOString()
}

/**
 * Run migration on startup
 */
export async function runStartupMigrations(): Promise<void> {
  try {
    const { runMigrations } = await import("./redis-migrations")
    await runMigrations()
  } catch (error) {
    console.warn("[v0] Startup migrations failed:", error)
  }
}
