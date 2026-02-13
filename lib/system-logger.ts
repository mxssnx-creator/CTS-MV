import { getRedisClient, initRedis } from "./redis-db"

export class SystemLogger {
  private static instance: SystemLogger
  private redisClient: any = null

  static getInstance(): SystemLogger {
    if (!SystemLogger.instance) {
      SystemLogger.instance = new SystemLogger()
    }
    return SystemLogger.instance
  }

  async initialize() {
    await initRedis()
    this.redisClient = getRedisClient()
  }

  async logToDatabase(entry: {
    level: "info" | "warn" | "error"
    category: string
    message: string
    data?: any
    timestamp?: string
  }) {
    if (!this.redisClient) await this.initialize()

    try {
      const logId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const logKey = `log:${logId}`

      const logEntry = {
        id: logId,
        level: entry.level,
        category: entry.category,
        message: entry.message,
        data: JSON.stringify(entry.data || {}),
        timestamp: entry.timestamp || new Date().toISOString(),
      }

      // Store as hash using hset (pass object directly, not spread)
      await (this.redisClient as any).hset(logKey, logEntry)

      // Add to sets for indexing
      await (this.redisClient as any).sadd("logs:all", logId)
      await (this.redisClient as any).sadd(`logs:${entry.category}`, logId)
    } catch (error) {
      console.error("[v0] [SystemLogger] Failed to log to database:", error)
    }
  }

  async logTradeEngine(message: string, data?: any) {
    await this.logToDatabase({
      level: "info",
      category: "trade_engine",
      message,
      data,
    })
  }

  async logConnection(message: string, data?: any) {
    await this.logToDatabase({
      level: "info",
      category: "connection",
      message,
      data,
    })
  }

  async logError(category: string, message: string, error?: any) {
    await this.logToDatabase({
      level: "error",
      category,
      message,
      data: error ? { error: String(error), stack: error.stack } : undefined,
    })
  }

  async getLogs(category?: string, limit: number = 100): Promise<any[]> {
    if (!this.redisClient) await this.initialize()

    try {
      const setKey = category ? `logs:${category}` : "logs:all"
      const logIds = await (this.redisClient as any).smembers(setKey)

      if (!logIds || logIds.length === 0) return []

      const logs = []
      for (const logId of logIds.slice(0, limit)) {
        const logKey = `log:${logId}`
        const log = await (this.redisClient as any).hgetall(logKey)
        if (log && Object.keys(log).length > 0) {
          logs.push(log)
        }
      }
      return logs
    } catch (error) {
      console.error("[v0] [SystemLogger] Failed to get logs:", error)
      return []
    }
  }
}

export const logger = SystemLogger.getInstance()
