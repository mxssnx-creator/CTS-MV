/**
 * Data Sync Manager
 * Manages data synchronization to avoid recalculating existing data
 * NOW: Redis-based, no SQL
 */

import { getSettings, setSettings } from "@/lib/redis-db"

interface SyncRange {
  start: Date
  end: Date
}

interface SyncStatus {
  needsSync: boolean
  missingRanges: SyncRange[]
  lastSyncEnd?: Date
}

export class DataSyncManager {
  /**
   * Check if data needs to be synced for a connection and symbol
   */
  static async checkSyncStatus(
    connectionId: string,
    symbol: string,
    dataType: "market_data" | "indication" | "position",
    requestedStart: Date,
    requestedEnd: Date,
  ): Promise<SyncStatus> {
    try {
      // Get sync status from Redis
      const syncKey = `sync_status:${connectionId}:${symbol}:${dataType}`
      const syncData = (await getSettings(syncKey)) || { lastSyncEnd: null }

      // If no previous sync, all data is missing
      if (!syncData.lastSyncEnd) {
        return {
          needsSync: true,
          missingRanges: [{ start: requestedStart, end: requestedEnd }],
        }
      }

      const lastSyncDate = new Date(syncData.lastSyncEnd)

      // If requested data is after last sync, need to sync new range
      if (requestedEnd > lastSyncDate) {
        return {
          needsSync: true,
          missingRanges: [{ start: lastSyncDate, end: requestedEnd }],
          lastSyncEnd: lastSyncDate,
        }
      }

      // All requested data already synced
      return {
        needsSync: false,
        missingRanges: [],
        lastSyncEnd: lastSyncDate,
      }
    } catch (error) {
      console.error("[v0] Error checking sync status:", error)
      // Default to syncing if there's an error
      return {
        needsSync: true,
        missingRanges: [{ start: requestedStart, end: requestedEnd }],
      }
    }
  }

  /**
   * Mark data as synced
   */
  static async markSynced(
    connectionId: string,
    symbol: string,
    dataType: "market_data" | "indication" | "position",
    syncEnd: Date,
  ): Promise<void> {
    try {
      const syncKey = `sync_status:${connectionId}:${symbol}:${dataType}`
      await setSettings(syncKey, {
        lastSyncEnd: syncEnd.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      console.log(`[v0] Marked ${dataType} as synced for ${symbol} until ${syncEnd.toISOString()}`)
    } catch (error) {
      console.error("[v0] Error marking data as synced:", error)
    }
  }
}
      // Get last successful sync
      const [lastSync] = await sql`
        SELECT sync_start, sync_end, status
        FROM data_sync_log
        WHERE connection_id = ${connectionId}
          AND symbol = ${symbol}
          AND data_type = ${dataType}
          AND status = 'success'
        ORDER BY sync_end DESC
        LIMIT 1
      `

      if (!lastSync) {
        // No previous sync, need full range
        return {
          needsSync: true,
          missingRanges: [{ start: requestedStart, end: requestedEnd }],
        }
      }

      const lastSyncEnd = new Date(lastSync.sync_end)

      // Check if requested range is already covered
      if (requestedEnd <= lastSyncEnd) {
        return {
          needsSync: false,
          missingRanges: [],
          lastSyncEnd,
        }
      }

      // Need to sync from last sync end to requested end
      return {
        needsSync: true,
        missingRanges: [{ start: lastSyncEnd, end: requestedEnd }],
        lastSyncEnd,
      }
    } catch (error) {
      console.error("[v0] Failed to check sync status:", error)
      // On error, assume full sync needed
      return {
        needsSync: true,
        missingRanges: [{ start: requestedStart, end: requestedEnd }],
      }
    }
  }

  /**
   * Log a sync operation
   */
  static async logSync(
    connectionId: string,
    symbol: string,
    dataType: "market_data" | "indication" | "position",
    syncStart: Date,
    syncEnd: Date,
    recordsSynced: number,
    status: "success" | "partial" | "failed",
    errorMessage?: string,
  ): Promise<void> {
    try {
      await sql`
        INSERT INTO data_sync_log (
          connection_id, symbol, data_type, sync_start, sync_end,
          records_synced, status, error_message
        )
        VALUES (
          ${connectionId}, ${symbol}, ${dataType}, ${syncStart.toISOString()},
          ${syncEnd.toISOString()}, ${recordsSynced}, ${status}, ${errorMessage || null}
        )
      `
    } catch (error) {
      console.error("[v0] Failed to log sync:", error)
    }
  }

  /**
   * Validate connection and check if data exists
   */
  static async validateConnection(connectionId: string): Promise<boolean> {
    try {
      const [connection] = await sql`
        SELECT id FROM exchange_connections
        WHERE id = ${connectionId}
      `
      return !!connection
    } catch (error) {
      console.error("[v0] Failed to validate connection:", error)
      return false
    }
  }

  /**
   * Get sync statistics for a connection
   */
  static async getSyncStats(connectionId: string) {
    try {
      const stats = await sql`
        SELECT 
          data_type,
          COUNT(*) as total_syncs,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_syncs,
          SUM(records_synced) as total_records,
          MAX(sync_end) as last_sync
        FROM data_sync_log
        WHERE connection_id = ${connectionId}
        GROUP BY data_type
      `

      return stats
    } catch (error) {
      console.error("[v0] Failed to get sync stats:", error)
      return []
    }
  }
}
