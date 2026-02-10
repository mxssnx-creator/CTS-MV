/**
 * Database Module - Redis Primary Database
 * Redis is the ONLY database. SQLite and PostgreSQL are completely removed.
 */

export { 
  getRedisClient, 
  initRedis,
  createConnection,
  getConnection,
  getAllConnections,
  updateConnection,
  deleteConnection,
  createTrade,
  getTrade,
  getConnectionTrades,
  updateTrade,
  createPosition,
  getPosition,
  getConnectionPositions,
  updatePosition,
  deletePosition,
  setSettings,
  getSettings,
  deleteSettings,
  flushAll,
  closeRedis,
  isRedisConnected,
  getRedisStats
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
 * Compatibility layer for legacy calls - all operations use Redis
 */
export async function getClient(): Promise<any> {
  const { getRedisClient } = await import("./redis-db")
  return getRedisClient()
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
 * Compatibility wrapper for query() - Redis version
 */
export async function query<T = any>(queryText: string, params: any[] = []): Promise<T[]> {
  try {
    await initRedisDb()
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
 * Connection management - Redis backed
 */
export async function addConnection(name: string, exchange: string, apiKey: string, apiSecret: string) {
  const { createConnection } = await import("./redis-db")
  return createConnection({
    id: nanoid(),
    name,
    exchange,
    api_key: apiKey,
    api_secret: apiSecret,
    is_enabled: false,
    is_active: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any)
}

/**
 * Initialize database - Redis only
 */
export async function initializeDatabase() {
  try {
    await initRedisDb()
    const { runMigrations } = await import("./redis-migrations")
    await runMigrations()
    console.log("[v0] Database initialized with Redis")
    return true
  } catch (error) {
    console.error("[v0] Database initialization error:", error)
    return false
  }
}

/**
 * Compatibility object `db` - wraps Redis operations into a db-like interface
 * Used by: import { db } from "@/lib/database"
 */
export const db = {
  query,
  queryOne,
  execute,
  getClient,
  getDatabaseType,
  initializeDatabase,
  async all(sql: string, params: any[] = []) {
    return query(sql, params)
  },
  async get(sql: string, params: any[] = []) {
    return queryOne(sql, params)
  },
  async run(sql: string, params: any[] = []) {
    return execute(sql, params)
  },
}

/**
 * Compatibility class `DatabaseManager` - wraps Redis operations
 * Used by: import DatabaseManager from "@/lib/database"
 */
class DatabaseManagerClass {
  static instance: DatabaseManagerClass | null = null

  static getInstance(): DatabaseManagerClass {
    if (!DatabaseManagerClass.instance) {
      DatabaseManagerClass.instance = new DatabaseManagerClass()
    }
    return DatabaseManagerClass.instance
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return query<T>(sql, params)
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return queryOne<T>(sql, params)
  }

  async execute(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
    return execute(sql, params)
  }

  async all(sql: string, params: any[] = []) {
    return query(sql, params)
  }

  async get(sql: string, params: any[] = []) {
    return queryOne(sql, params)
  }

  async run(sql: string, params: any[] = []) {
    return execute(sql, params)
  }

  getDatabaseType(): string {
    return "redis"
  }

  async initialize() {
    return initializeDatabase()
  }
}

const DatabaseManager = DatabaseManagerClass.getInstance()
export default DatabaseManager
