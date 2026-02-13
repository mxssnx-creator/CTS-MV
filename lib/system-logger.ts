import { getRedisClient } from "./redis-db"

export class SystemLogger {
  private static instance: SystemLogger
  private logsCache: Map<string, any[]> = new Map()

  private constructor() {}

  static getInstance(): SystemLogger {
    if (!SystemLogger.instance) {
      SystemLogger.instance = new SystemLogger()
    }
    return SystemLogger.instance
  }

  async logToDatabase(category: string, entry: any): Promise<void> {
    try {
      const client = getRedisClient()
      const logId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const logKey = `log:${logId}`

      const logEntry = {
        id: logId,
        category,
        timestamp: new Date().toISOString(),
        ...entry,
      }

      // Store log entry using lowercase hset method
      await client.hset(logKey, logEntry)

      // Add to logs index set using lowercase sadd
      await client.sadd("logs:all", logId)

      // Add to category index
      await client.sadd(`logs:${category}`, logId)

      // Set TTL for automatic cleanup (7 days)
      await client.expire(logKey, 7 * 24 * 60 * 60)
    } catch (error) {
      console.error("[SystemLogger] Failed to log to database:", error)
    }
  }

  async logTradeEngine(action: string, data: any): Promise<void> {
    await this.logToDatabase("trade_engine", {
      action,
      data,
    })
  }

  async logConnection(action: string, connectionId: string, data: any): Promise<void> {
    await this.logToDatabase("connection", {
      action,
      connectionId,
      data,
    })
  }

  async logError(error: Error | string, context?: any): Promise<void> {
    await this.logToDatabase("error", {
      message: typeof error === "string" ? error : error.message,
      stack: typeof error === "string" ? "" : error.stack,
      context,
    })
  }

  async logTrade(tradeId: string, action: string, data: any): Promise<void> {
    await this.logToDatabase("trade", {
      tradeId,
      action,
      data,
    })
  }

  async getLogsForConnection(connectionId: string, limit: number = 100): Promise<any[]> {
    try {
      const client = getRedisClient()
      const setKey = `logs:connection:${connectionId}`
      const logIds = (await client.smembers(setKey)) || []

      const logs = []
      for (const logId of logIds.slice(0, limit)) {
        const log = await client.hgetall(`log:${logId}`)
        if (log && Object.keys(log).length > 0) {
          logs.push(log)
        }
      }

      return logs
    } catch (error) {
      console.error("[SystemLogger] Failed to get logs:", error)
      return []
    }
  }
}
