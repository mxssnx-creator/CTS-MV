import { getRedisClient, initRedis } from "./redis-db"
import { nanoid } from "nanoid"

export interface LogEntry {
  level: "info" | "warn" | "error" | "debug"
  category: "system" | "trade-engine" | "api" | "database" | "connection" | "toast"
  message: string
  context?: string
  metadata?: Record<string, any>
  error?: Error
  userId?: string
  connectionId?: string
}

export class SystemLogger {
  private static dbLoggingDisabled = false

  /**
   * Log to Redis database with proper error handling
   */
  private static async logToDatabase(entry: LogEntry): Promise<void> {
    if (SystemLogger.dbLoggingDisabled) {
      return
    }

    try {
      await initRedis()
      const client = getRedisClient()
      
      const logId = nanoid()
      const logKey = `log:${logId}`
      const errorMessage = entry.error?.message || null
      const errorStack = entry.error?.stack || null

      // Store log entry in Redis
      const logEntry = {
        id: logId,
        level: entry.level,
        category: entry.category,
        message: entry.message,
        context: entry.context || null,
        user_id: entry.userId || null,
        connection_id: entry.connectionId || null,
        error_message: errorMessage,
        error_stack: errorStack,
        metadata: JSON.stringify(entry.metadata || {}),
        timestamp: new Date().toISOString(),
      }

      // Use Redis HSET to store the log
      const fields = Object.entries(logEntry).flat()
      await (client as any).hset(logKey, ...fields)

      // Add to logs index set
      await (client as any).sadd("logs:all", logId)
      
      // Add to category index
      await (client as any).sadd(`logs:${entry.category}`, logId)
      
      // Set TTL (7 days)
      await (client as any).expire(logKey, 7 * 24 * 60 * 60)
    } catch (dbError) {
      // Disable database logging for critical errors to prevent spam
      if (dbError instanceof Error) {
        const errorMsg = dbError.message.toLowerCase()
        const errorCode = (dbError as any).code || ""
        
        if (errorMsg.includes("no such table: site_logs")) {
          console.warn(
            "[SystemLogger] site_logs table not found - disabling database logging. Please run database initialization."
          )
          SystemLogger.dbLoggingDisabled = true
        } else if (
          errorMsg.includes("readonly") || 
          errorMsg.includes("disk i/o error") ||
          errorCode === "SQLITE_IOERR" ||
          errorCode.startsWith("SQLITE_IOERR_")
        ) {
          // Only log this warning once, then fail silently
          if (!SystemLogger.dbLoggingDisabled) {
            console.warn(
              "[SystemLogger] Database is read-only or has I/O errors - disabling database logging. This is normal in serverless environments."
            )
          }
          SystemLogger.dbLoggingDisabled = true
        } else {
          console.error("[SystemLogger] Failed to log to database:", dbError)
        }
      }
    }
  }

  /**
   * Log system events
   */
  static async logSystem(
    message: string,
    level: LogEntry["level"] = "info",
    metadata?: Record<string, any>,
  ): Promise<void> {
    const entry: LogEntry = {
      level,
      category: "system",
      message,
      metadata,
    }

    console.log(`[System] [${level.toUpperCase()}] ${message}`, metadata || "")
    await this.logToDatabase(entry)
  }

  /**
   * Log trade engine events
   */
  static async logTradeEngine(
    message: string,
    level: LogEntry["level"] = "info",
    metadata?: Record<string, any>,
  ): Promise<void> {
    const entry: LogEntry = {
      level,
      category: "trade-engine",
      message,
      metadata,
    }

    console.log(`[TradeEngine] [${level.toUpperCase()}] ${message}`, metadata || "")
    await this.logToDatabase(entry)
  }

  /**
   * Log API events
   */
  static async logAPI(
    message: string,
    level: LogEntry["level"] = "info",
    context?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const entry: LogEntry = {
      level,
      category: "api",
      message,
      context,
      metadata,
    }

    console.log(`[API] [${level.toUpperCase()}] ${context || "unknown"}: ${message}`, metadata || "")
    await this.logToDatabase(entry)
  }

  /**
   * Log database events
   */
  static async logDatabase(
    message: string,
    level: LogEntry["level"] = "info",
    metadata?: Record<string, any>,
  ): Promise<void> {
    const entry: LogEntry = {
      level,
      category: "database",
      message,
      metadata,
    }

    console.log(`[Database] [${level.toUpperCase()}] ${message}`, metadata || "")
    await this.logToDatabase(entry)
  }

  /**
   * Log connection events
   */
  static async logConnection(
    message: string,
    connectionId: string,
    level: LogEntry["level"] = "info",
    metadata?: Record<string, any>,
  ): Promise<void> {
    const entry: LogEntry = {
      level,
      category: "connection",
      message,
      connectionId,
      metadata,
    }

    console.log(`[Connection:${connectionId}] [${level.toUpperCase()}] ${message}`, metadata || "")
    await this.logToDatabase(entry)
  }

  /**
   * Log toast messages for tracking user notifications
   */
  static async logToast(
    message: string,
    type: "success" | "error" | "info" | "warning",
    context?: string,
    userId?: string,
  ): Promise<void> {
    const levelMap = {
      success: "info" as const,
      error: "error" as const,
      info: "info" as const,
      warning: "warn" as const,
    }

    const entry: LogEntry = {
      level: levelMap[type],
      category: "toast",
      message,
      context,
      userId,
      metadata: { toastType: type },
    }

    console.log(`[Toast] [${type.toUpperCase()}] ${message}`)
    await this.logToDatabase(entry)
  }

  /**
   * Log errors with full stack trace
   */
  static async logError(
    error: Error | unknown,
    category: LogEntry["category"],
    context?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const errorObj = error instanceof Error ? error : new Error(String(error))

    const entry: LogEntry = {
      level: "error",
      category,
      message: errorObj.message,
      context,
      error: errorObj,
      metadata,
    }

    console.error(`[${category}] [ERROR] ${context || "unknown"}:`, errorObj)
    await this.logToDatabase(entry)
  }
}
