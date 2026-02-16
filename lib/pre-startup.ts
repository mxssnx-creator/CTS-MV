/**
 * Pre-startup: Initialize Redis and run all critical setup tasks
 * Runs once on first deploy or server start
 */

import { initRedis, createConnection, getAllConnections, saveMarketData, setSettings, getSettings, updateConnection } from "@/lib/redis-db"
import { runMigrations } from "@/lib/redis-migrations"
import { getPredefinedAsExchangeConnections } from "@/lib/connection-predefinitions"
import { loadSettingsAsync, saveSettings as saveSettingsToFile, getDefaultSettings } from "@/lib/settings-storage"
import { initializeTradeEngineAutoStart } from "@/lib/trade-engine-auto-start"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"

async function seedMarketData() {
  console.log("[v0] [Seed] Starting market data seeding...")

  const symbols = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT",
    "DOGEUSDT", "LINKUSDT", "LITUSDT", "THETAUSDT", "AVAXUSDT",
    "MATICUSDT", "SOLUSDT", "UNIUSDT", "APTUSDT", "ARBUSDT"
  ]

  const basePrices: Record<string, number> = {
    BTCUSDT: 45000,
    ETHUSDT: 2500,
    BNBUSDT: 400,
    XRPUSDT: 2.5,
    ADAUSDT: 0.95,
    DOGEUSDT: 0.35,
    LINKUSDT: 25,
    LITUSDT: 120,
    THETAUSDT: 2.5,
    AVAXUSDT: 35,
    MATICUSDT: 1.2,
    SOLUSDT: 180,
    UNIUSDT: 18,
    APTUSDT: 8,
    ARBUSDT: 0.9,
  }

  let seededCount = 0
  let totalDataPoints = 0
  
  for (const symbol of symbols) {
    try {
      const basePrice = basePrices[symbol] || 100
      // Seed 20 historical data points for better backtesting
      for (let i = 0; i < 20; i++) {
        const variation = basePrice * 0.02
        const price = basePrice + (Math.random() - 0.5) * variation
        const marketData = {
          symbol,
          exchange: "bybit",
          interval: "1m",
          price,
          open: basePrice,
          high: basePrice + variation,
          low: basePrice - variation,
          close: price,
          volume: Math.random() * 1000000,
          timestamp: new Date(Date.now() - (20 - i) * 60000).toISOString(),
        }
        await saveMarketData(symbol, marketData)
        totalDataPoints++
      }
      seededCount++
      console.log(`[v0] [Seed] ✓ ${symbol}: 20 data points`)
    } catch (error) {
      console.warn(`[v0] [Seed] ✗ Failed to seed ${symbol}:`, error)
    }
  }
  console.log(`[v0] [Seed] Complete: ${totalDataPoints} data points across ${seededCount}/${symbols.length} symbols`)
}

async function seedPredefinedConnections() {
  console.log("[v0] [Seed] Starting connections seeding...")
  try {
    const predefined = getPredefinedAsExchangeConnections()
    console.log(`[v0] [Seed] Got ${predefined.length} predefined connections from schema`)
    
    const existing = await getAllConnections() || []
    console.log(`[v0] [Seed] Found ${existing.length} existing connections in database`)
    
    let seededCount = 0
    
    for (const conn of predefined) {
      try {
        const exists = existing.some((c: any) => c.id === conn.id)
        if (!exists) {
          // Ensure enabled connections are also active for trade engine auto-start
          const connectionData = {
            ...conn,
            is_active: conn.is_enabled !== false, // Active if enabled
          }
          console.log(`[v0] [Seed] Creating: ${conn.name} (enabled: ${conn.is_enabled}, active: ${connectionData.is_active})`)
          await createConnection(connectionData)
          seededCount++
        } else {
          console.log(`[v0] [Seed] Skipping ${conn.name} - already exists`)
        }
      } catch (error) {
        console.warn(`[v0] [Seed] ✗ Failed to seed ${conn.name}:`, error instanceof Error ? error.message : String(error))
      }
    }
    console.log(`[v0] [Seed] Complete: ${seededCount} new connections created`)
    
    // Log summary of active connections for trade engine startup
    const allConnections = await getAllConnections()
    console.log(`[v0] [Seed] Retrieved ${allConnections.length} total connections from database`)
    
    // Log each connection's active state for debugging
    allConnections.forEach((c: any, idx: number) => {
      const activeStr = c.is_active === true ? "✓ ACTIVE" : "✗ INACTIVE"
      console.log(`  [${idx + 1}] ${c.name}: ${activeStr} (enabled=${c.is_enabled}, active=${c.is_active}, type=${typeof c.is_active})`)
    })
    
    // Filter for truly active connections (boolean true)
    const activeConnections = allConnections.filter((c: any) => c.is_active === true)
    console.log(`[v0] [Seed] Connection Summary: ${activeConnections.length}/${allConnections.length} active and ready for trade engines`)
    
    // Log the active ones
    activeConnections.forEach((c: any) => {
      console.log(`  → Ready: ${c.name} (${c.exchange})`)
    })
  } catch (error) {
    console.error("[v0] [Seed] Failed to seed predefined connections:", error instanceof Error ? error.message : String(error))
  }
}

async function initializeDefaultSettings() {
  console.log("[v0] [Seed] Initializing default settings...")
  try {
    const defaults = getDefaultSettings()
    
    console.log("[v0] [Seed] Default settings keys:", Object.keys(defaults))
    console.log("[v0] [Seed] Saving to Redis with key 'app_settings'...")
    
    // Save to Redis database
    await setSettings("app_settings", defaults)
    console.log("[v0] [Seed] Default settings initialized and saved to Redis:", Object.keys(defaults).length, "keys")
    
    // Verify the save by reading it back
    const verified = await getSettings("app_settings")
    if (verified) {
      console.log("[v0] [Seed] ✓ Settings verified - successfully saved and retrieved")
    } else {
      console.warn("[v0] [Seed] ✗ Settings verification FAILED - could not retrieve saved settings")
    }
  } catch (error) {
    console.warn("[v0] [Seed] Failed to initialize default settings:", error)
  }
}

async function testAllExchangeConnections() {
  console.log("[v0] [Startup] Testing all exchange connections...")
  try {
    const allConnections = await getAllConnections()
    
    for (const connection of allConnections) {
      try {
        // Call test connection API for each connection
        const testResponse = await fetch(`${process.env.NEXTURL || "http://localhost:3000"}/api/settings/connections/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exchange: connection.exchange,
            api_key: connection.api_key,
            api_secret: connection.api_secret,
            api_type: connection.api_type,
            api_subtype: connection.api_subtype,
            is_testnet: connection.is_testnet,
          }),
        })
        
        const testResult = await testResponse.json()
        const testStatus = testResult.success ? "success" : "failed"
        
        // Update connection with test result
        await updateConnection(connection.id, {
          ...connection,
          last_test_status: testStatus,
          last_test_time: new Date().toISOString(),
        })
        
        console.log(`[v0] [Startup] Tested ${connection.name} (${connection.exchange}): ${testStatus}`)
      } catch (error) {
        console.warn(`[v0] [Startup] Failed to test ${connection.name}:`, error)
        
        // Mark as failed
        await updateConnection(connection.id, {
          ...connection,
          last_test_status: "error",
          last_test_time: new Date().toISOString(),
        })
      }
    }
    
    console.log(`[v0] [Startup] Completed testing ${allConnections.length} connections`)
  } catch (error) {
    console.error("[v0] [Startup] Failed to test connections:", error)
  }
}

function startPeriodicConnectionTesting() {
  // Test all connections every 5 minutes
  const intervalId = setInterval(async () => {
    console.log("[v0] [Periodic] Running 5-minute connection tests...")
    await testAllExchangeConnections()
  }, 5 * 60 * 1000) // 5 minutes
  
  // Store interval ID globally so it can be cleared if needed
  if (typeof global !== "undefined") {
    (global as any).connectionTestingIntervalId = intervalId
  }
}
async function initializeDefaultActiveConnections() {
  console.log("[v0] [Seed] Initializing default active connections (Bybit & BingX)...")
  try {
    const allConnections = await getAllConnections()
    
    // Find bybit-x03 and bingx-x01
    const bybit = allConnections.find((c: any) => c.id === "bybit-x03")
    const bingx = allConnections.find((c: any) => c.id === "bingx-x01")
    
    let activatedCount = 0
    
    // Set bybit-x03 as active connection (is_enabled_dashboard = true)
    if (bybit) {
      if (!bybit.is_enabled_dashboard || bybit.is_enabled_dashboard === "0") {
        console.log("[v0] [Seed] Setting bybit-x03 as active connection...")
        await updateConnection("bybit-x03", {
          ...bybit,
          is_enabled_dashboard: "1"
        })
        activatedCount++
        console.log("[v0] [Seed] ✓ bybit-x03 added to active connections")
      } else {
        console.log("[v0] [Seed] bybit-x03 already on active list")
      }
    } else {
      console.warn("[v0] [Seed] bybit-x03 not found in database")
    }
    
    // Set bingx-x01 as active connection (is_enabled_dashboard = true)
    if (bingx) {
      if (!bingx.is_enabled_dashboard || bingx.is_enabled_dashboard === "0") {
        console.log("[v0] [Seed] Setting bingx-x01 as active connection...")
        await updateConnection("bingx-x01", {
          ...bingx,
          is_enabled_dashboard: "1"
        })
        activatedCount++
        console.log("[v0] [Seed] ✓ bingx-x01 added to active connections")
      } else {
        console.log("[v0] [Seed] bingx-x01 already on active list")
      }
    } else {
      console.warn("[v0] [Seed] bingx-x01 not found in database")
    }
    
    console.log(`[v0] [Seed] Default active connections initialized: ${activatedCount} connections added to active list`)
  } catch (error) {
    console.error("[v0] [Seed] Failed to initialize default active connections:", error)
  }
}

export async function runPreStartup() {
  try {
    console.log("[v0] ==========================================")
    console.log("[v0] PRE-STARTUP INITIALIZATION STARTED")
    console.log("[v0] ==========================================")
    
    console.log("[v0] [1/8] Initializing Redis with file persistence...")
    await initRedis()
    console.log("[v0] [1/8] ✓ Redis initialized with persistence - snapshots every 60 seconds")
    
    console.log("[v0] [2/8] Running ALL Redis migrations (automatic)...")
    const migrationResult = await runMigrations()
    console.log(`[v0] [2/8] ✓ Migrations completed: ${migrationResult.message}`)
    console.log(`[v0] [2/8] ✓ Current schema version: ${migrationResult.version}`)
    
    console.log("[v0] [3/8] Initializing settings...")
    await initializeDefaultSettings()
    console.log("[v0] [3/8] ✓ Settings initialized")
    
    console.log("[v0] [4/8] Seeding exchange connections...")
    await seedPredefinedConnections()
    console.log("[v0] [4/8] ✓ Connections seeded")
    
    console.log("[v0] [5/8] Seeding market data...")
    await seedMarketData()
    console.log("[v0] [5/8] ✓ Market data seeded")
    
    console.log("[v0] [6/8] Initializing default active connections...")
    await initializeDefaultActiveConnections()
    console.log("[v0] [6/8] ✓ Default active connections initialized")
    
    console.log("[v0] [7/8] Initializing Trade Engine...")
    await initializeTradeEngineAutoStart()
    console.log("[v0] [7/8] ✓ Trade Engine initialized and auto-start activated")
    
    console.log("[v0] [8/8] Startup complete - connection testing will start via /api/health/startup-complete")
    console.log("[v0] [8/8] ✓ Pre-startup finished")
    
    console.log("[v0] ==========================================")
    console.log("[v0] PRE-STARTUP COMPLETE - SYSTEM READY")
    console.log("[v0] ==========================================")
  } catch (error) {
    console.error("[v0] ==========================================")
    console.error("[v0] PRE-STARTUP ERROR")
    console.error("[v0]", error)
    console.error("[v0] ==========================================")
    // Don't throw - allow app to continue with degraded functionality
  }
}
