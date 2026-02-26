/**
 * Engine Progression Logs - Stores detailed logs of all engine operations
 * Allows debugging of progression phases and error tracking
 */

import { getRedisClient } from "@/lib/redis-db"

export interface ProgressionLogEntry {
  timestamp: string
  level: "info" | "warning" | "error" | "debug"
  phase: string
  message: string
  details?: Record<string, any>
  connectionId: string
}

const LOG_RETENTION_HOURS = 24
const MAX_LOGS_PER_CONNECTION = 500

/**
 * Log a progression event for a connection
 */
export async function logProgressionEvent(
  connectionId: string,
  phase: string,
  level: "info" | "warning" | "error" | "debug",
  message: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    const client = getRedisClient()
    const timestamp = new Date().toISOString()
    const logKey = `engine_logs:${connectionId}`

    const entry: ProgressionLogEntry = {
      timestamp,
      level,
      phase,
      message,
      details,
      connectionId,
    }

    // Store in Redis list (most recent first when sorted by score)
    const score = Date.now()
    await client.zadd(logKey, { score, member: JSON.stringify(entry) })

    // Trim to max logs, keeping most recent
    await client.zremrangebyrank(logKey, MAX_LOGS_PER_CONNECTION, -1)

    // Set expiry to 24 hours
    await client.expire(logKey, LOG_RETENTION_HOURS * 3600)

    // Also log to console for immediate visibility
    console.log(`[v0] [${level.toUpperCase()}] [${phase}] ${message}`, details || "")
  } catch (error) {
    console.error("[v0] [EngineLog] Failed to store progression log:", error instanceof Error ? error.message : String(error))
  }
}

/**
 * Get all progression logs for a connection
 */
export async function getProgressionLogs(connectionId: string): Promise<ProgressionLogEntry[]> {
  try {
    const client = getRedisClient()
    const logKey = `engine_logs:${connectionId}`

    // Get all logs sorted by recency (newest first)
    const logData = await client.zrange(logKey, 0, -1, { rev: true })

    return logData
      .map((entry) => {
        try {
          return JSON.parse(entry) as ProgressionLogEntry
        } catch {
          return null
        }
      })
      .filter((entry): entry is ProgressionLogEntry => entry !== null)
  } catch (error) {
    console.error("[v0] [EngineLog] Failed to retrieve logs:", error instanceof Error ? error.message : String(error))
    return []
  }
}

/**
 * Clear logs for a connection
 */
export async function clearProgressionLogs(connectionId: string): Promise<void> {
  try {
    const client = getRedisClient()
    const logKey = `engine_logs:${connectionId}`
    await client.del(logKey)
  } catch (error) {
    console.error("[v0] [EngineLog] Failed to clear logs:", error instanceof Error ? error.message : String(error))
  }
}

/**
 * Format logs for display
 */
export function formatLogsForDisplay(logs: ProgressionLogEntry[]): string {
  if (logs.length === 0) {
    return "No logs yet. Enable the connection to start logging."
  }

  return logs
    .map((log) => {
      const time = new Date(log.timestamp).toLocaleTimeString()
      const level = log.level.toUpperCase().padEnd(7)
      const details = log.details ? ` | ${JSON.stringify(log.details)}` : ""
      return `[${time}] ${level} | ${log.phase.padEnd(20)} | ${log.message}${details}`
    })
    .join("\n")
}
