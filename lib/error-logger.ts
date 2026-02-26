/**
 * Error Logger - Redis-native
 * Logs errors, info, warnings and debug messages to Redis
 */

import { initRedis, getRedisClient, setSettings } from "@/lib/redis-db"

interface ErrorLogOptions {
  category?: string
  userId?: string
  connectionId?: string
  metadata?: Record<string, any>
  severity?: "low" | "medium" | "high" | "critical"
}

export class ErrorLogger {
  private static async writeLog(level: string, category: string, message: string, extra: Record<string, any> = {}): Promise<void> {
    try {
      await initRedis()
      const client = getRedisClient()
      const logId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const logEntry = {
        level,
        category,
        message,
        timestamp: new Date().toISOString(),
        ...extra,
      }

      await setSettings(`site_log:${logId}`, logEntry)
      await client.zadd("site_logs:all", Date.now(), logId)
      await client.zadd(`site_logs:${level}`, Date.now(), logId)

      // Trim to last 1000 entries per level
      const count = await client.zcard(`site_logs:${level}`)
      if (count > 1000) {
        const toRemove = await client.zrange(`site_logs:${level}`, 0, count - 1001)
        for (const id of toRemove) {
          await client.del(`site_log:${id}`)
        }
        await client.zremrangebyrank(`site_logs:${level}`, 0, count - 1001)
      }
    } catch (logError) {
      console.error("[v0] Failed to write log to Redis:", logError)
    }
  }

  static async logError(error: Error | unknown, context: string, options: ErrorLogOptions = {}): Promise<void> {
    const { category = "API", userId, connectionId, metadata = {}, severity = "medium" } = options
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error(`[v0] Error in ${context}:`, { message: errorMessage, category, severity })

    await this.writeLog("error", category, `${context}: ${errorMessage}`, {
      context,
      user_id: userId || null,
      connection_id: connectionId || null,
      error_message: errorMessage,
      error_stack: errorStack || null,
      metadata: { ...metadata, severity },
    })
  }

  static async logInfo(message: string, context: string, metadata: Record<string, any> = {}): Promise<void> {
    console.log(`[v0] Info in ${context}:`, message)
    await this.writeLog("info", "system", `${context}: ${message}`, { context, metadata })
  }

  static async logWarning(message: string, context: string, metadata: Record<string, any> = {}): Promise<void> {
    console.warn(`[v0] Warning in ${context}:`, message)
    await this.writeLog("warn", "system", `${context}: ${message}`, { context, metadata })
  }

  static async logDebug(message: string, context: string, metadata: Record<string, any> = {}): Promise<void> {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[v0] Debug in ${context}:`, message)
    }
    await this.writeLog("debug", "system", `${context}: ${message}`, { context, metadata })
  }
}
