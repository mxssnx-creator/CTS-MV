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

// In-memory buffer for batch logging (reduces Redis writes significantly)
const logBuffer: Map<string, string[]> = new Map()
const BUFFER_FLUSH_SIZE = 20 // Flush every 20 logs
const BUFFER_FLUSH_INTERVAL = 5000 // Or every 5 seconds
let flushTimerStarted = false

/**
 * Log a progression event for a connection
 * OPTIMIZED: Uses in-memory buffering to batch Redis writes
 */
export async function logProgressionEvent(
  connectionId: string,
  phase: string,
  level: "info" | "warning" | "error" | "debug",
  message: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    const timestamp = new Date().toISOString()
    const logKey = `engine_logs:${connectionId}`
    
    // Format: "timestamp|level|phase|message|details_json"
    const logEntry = `${timestamp}|${level}|${phase}|${message}|${JSON.stringify(details || {})}`
    
    // Add to buffer instead of writing immediately
    if (!logBuffer.has(logKey)) {
      logBuffer.set(logKey, [])
    }
    const buffer = logBuffer.get(logKey)!
    buffer.push(logEntry)
    
    // Start flush timer if not started
    if (!flushTimerStarted) {
      flushTimerStarted = true
      setInterval(flushAllLogBuffers, BUFFER_FLUSH_INTERVAL)
    }
    
    // Flush if buffer is full
    if (buffer.length >= BUFFER_FLUSH_SIZE) {
      await flushLogBuffer(logKey)
    }

    // Skip console.log for debug and info levels to reduce noise
    if (level === "error" || level === "warning") {
      console.log(`[v0] [${level.toUpperCase()}] [${phase}] ${message}`, details || "")
    }
  } catch (error) {
    // Silent fail - logging should never block main operations
  }
}

/**
 * Flush log buffer for a specific key
 */
async function flushLogBuffer(logKey: string): Promise<void> {
  const buffer = logBuffer.get(logKey)
  if (!buffer || buffer.length === 0) return
  
  try {
    const client = getRedisClient()
    
    // Use lpush for efficient prepend (native Redis list operation)
    await client.lpush(logKey, ...buffer.reverse())
    
    // Trim to max size
    await client.ltrim(logKey, 0, MAX_LOGS_PER_CONNECTION - 1)
    
    // Clear buffer
    logBuffer.set(logKey, [])
  } catch (error) {
    // Keep buffer for retry on next flush
  }
}

/**
 * Flush all log buffers
 */
async function flushAllLogBuffers(): Promise<void> {
  for (const logKey of logBuffer.keys()) {
    await flushLogBuffer(logKey)
  }
}

/**
 * Get all progression logs for a connection
 * OPTIMIZED: Uses native Redis list operations
 */
export async function getProgressionLogs(connectionId: string): Promise<ProgressionLogEntry[]> {
  try {
    const client = getRedisClient()
    const logKey = `engine_logs:${connectionId}`

    // Use lrange for efficient list retrieval
    const logs = await client.lrange(logKey, 0, MAX_LOGS_PER_CONNECTION - 1)
    if (!logs || logs.length === 0) return []

    // Parse each log entry from "timestamp|level|phase|message|details_json"
    return logs
      .map((entry) => {
        try {
          const parts = entry.split("|")
          if (parts.length < 4) return null
          
          const [timestamp, level, phase, message, ...detailsParts] = parts
          const detailsJson = detailsParts.join("|") // Rejoin in case details contained |
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
