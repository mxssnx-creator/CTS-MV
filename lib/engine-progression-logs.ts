/**
 * Engine Progression Logs - Stores detailed logs of all engine operations
 * Uses simple Redis lists (not sorted sets) for compatibility with Upstash
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

    // Store in Redis list (prepend to keep most recent at front)
    // Format: "timestamp|level|phase|message|details_json"
    const logEntry = `${timestamp}|${level}|${phase}|${message}|${JSON.stringify(details || {})}`
    
    // Use lpush-like operation: prepend to list
    let logs: string[] = []
    const existing = await client.get(logKey)
    if (existing) {
      try {
        logs = JSON.parse(existing)
        if (!Array.isArray(logs)) logs = []
      } catch {
        logs = []
      }
    }
    
    // Prepend new entry
    logs.unshift(logEntry)
    
    // Trim to max logs, keeping most recent
    if (logs.length > MAX_LOGS_PER_CONNECTION) {
      logs = logs.slice(0, MAX_LOGS_PER_CONNECTION)
    }
    
    // Save back to Redis with TTL (24 hours)
    const ttlSeconds = LOG_RETENTION_HOURS * 3600 // 24 hours = 86400 seconds
    await client.set(logKey, JSON.stringify(logs), { EX: ttlSeconds })

    // Skip console.log for debug level to reduce noise
    if (level !== "debug") {
      console.log(`[v0] [${level.toUpperCase()}] [${phase}] ${message}`, details || "")
    }
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

    const existing = await client.get(logKey)
    if (!existing) return []

    let logs: string[] = []
    try {
      logs = JSON.parse(existing)
      if (!Array.isArray(logs)) logs = []
    } catch {
      return []
    }

    // Parse each log entry from "timestamp|level|phase|message|details_json"
    return logs
      .map((entry) => {
        try {
          const parts = entry.split("|")
          if (parts.length < 4) return null
          
          const [timestamp, level, phase, message, detailsJson] = parts
          let details: Record<string, any> = {}
          try {
            details = JSON.parse(detailsJson || "{}")
          } catch {
            details = {}
          }
          
          return {
            timestamp,
            level: (level as any) || "info",
            phase,
            message,
            details,
            connectionId,
          } as ProgressionLogEntry
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
      const details = log.details && Object.keys(log.details).length > 0 ? ` | ${JSON.stringify(log.details)}` : ""
      return `[${time}] ${level} | ${log.phase.padEnd(20)} | ${log.message}${details}`
    })
    .join("\n")
}
