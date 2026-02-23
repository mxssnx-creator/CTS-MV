import { initRedis, getRedisClient, getAllConnections } from "@/lib/redis-db"

async function runMigration015() {
  console.log("[Migration 015] Starting - Fix connection inserted/enabled states")
  
  await initRedis()
  const client = getRedisClient()
  
  // Check current schema version
  const currentVersion = await client.get("_schema_version")
  console.log(`[Migration 015] Current schema version: ${currentVersion}`)
  
  // The 4 base exchanges that should be marked as INSERTED and ENABLED
  const baseExchangeIds = ["bybit-x03", "bingx-x01", "binance-x01", "okx-x01"]
  
  const connections = await client.smembers("connections")
  console.log(`[Migration 015] Total connections in Redis: ${connections.length}`)
  
  let updatedBase = 0
  let updatedOther = 0
  
  for (const connId of connections) {
    const connData = await client.hgetall(`connection:${connId}`)
    if (!connData || Object.keys(connData).length === 0) {
      console.log(`[Migration 015] Skipping ${connId} - no data`)
      continue
    }
    
    console.log(`[Migration 015] Before: ${connId} -> is_inserted=${connData.is_inserted}, is_enabled=${connData.is_enabled}, is_predefined=${connData.is_predefined}, is_enabled_dashboard=${connData.is_enabled_dashboard}`)
    
    if (baseExchangeIds.includes(connId)) {
      // Mark as INSERTED and ENABLED in Settings (base connection)
      await client.hset(`connection:${connId}`, {
        is_inserted: "1",
        is_enabled: "1",
        is_predefined: "1",
        updated_at: new Date().toISOString(),
      })
      updatedBase++
      
      const after = await client.hgetall(`connection:${connId}`)
      console.log(`[Migration 015] After:  ${connId} -> is_inserted=${after.is_inserted}, is_enabled=${after.is_enabled} (BASE CONNECTION)`)
    } else {
      // Non-base predefined connections: just informational templates
      await client.hset(`connection:${connId}`, {
        is_inserted: "0",
        is_enabled: "0",
        is_predefined: "1",
        is_enabled_dashboard: "0",
        updated_at: new Date().toISOString(),
      })
      updatedOther++
      
      const after = await client.hgetall(`connection:${connId}`)
      console.log(`[Migration 015] After:  ${connId} -> is_inserted=${after.is_inserted}, is_enabled=${after.is_enabled} (TEMPLATE ONLY)`)
    }
  }
  
  // Update schema version
  await client.set("_schema_version", "15")
  
  console.log(`[Migration 015] Complete: ${updatedBase} base connections, ${updatedOther} template connections`)
  console.log(`[Migration 015] Schema version updated to 15`)
  
  // Verify
  const allConns = await getAllConnections()
  const inserted = allConns.filter((c: any) => c.is_inserted === "1")
  const enabled = allConns.filter((c: any) => c.is_enabled === "1")
  console.log(`[Migration 015] Verification - Inserted: ${inserted.length}, Enabled: ${enabled.length}, Total: ${allConns.length}`)
}

runMigration015().catch(console.error)
