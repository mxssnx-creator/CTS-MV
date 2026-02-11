/**
 * Pre-startup: Initialize Redis and run all critical setup tasks
 * Runs once on first deploy or server start
 */

import { initRedis, createConnection, getAllConnections, saveMarketData } from "@/lib/redis-db"
import { runMigrations } from "@/lib/redis-migrations"
import { getPredefinedAsExchangeConnections } from "@/lib/connection-predefinitions"

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
    const existing = await getAllConnections() || []
    let seededCount = 0
    
    for (const conn of predefined) {
      try {
        const exists = existing.some((c: any) => c.id === conn.id)
        if (!exists) {
          console.log(`[v0] [Seed] Creating: ${conn.name} (enabled: ${conn.is_enabled})`)
          await createConnection(conn)
          seededCount++
        }
      } catch (error) {
        console.warn(`[v0] [Seed] ✗ Failed to seed ${conn.name}:`, error)
      }
    }
    console.log(`[v0] [Seed] Complete: ${seededCount} new connections created`)
  } catch (error) {
    console.error("[v0] [Seed] Failed to seed predefined connections:", error)
  }
}

async function initializeDefaultSettings() {
  console.log("[v0] [Seed] Initializing default settings...")
  
  // Skip in Edge Runtime - file system not available
  if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "edge") {
    console.log("[v0] [Seed] Skipped (Edge Runtime)")
    return
  }
  
  try {
    // Dynamic import to avoid loading fs/path in Edge Runtime
    const { loadSettingsAsync, saveSettings: saveSettingsToFile, getDefaultSettings } = await import("@/lib/settings-storage")
    const existing = await loadSettingsAsync()
    
    if (!existing || Object.keys(existing).length <= Object.keys(getDefaultSettings()).length) {
      const defaults = getDefaultSettings()
      saveSettingsToFile(defaults)
      console.log("[v0] [Seed] Default settings initialized")
    } else {
      console.log("[v0] [Seed] Settings already exist:", Object.keys(existing).length, "keys")
    }
  } catch (error) {
    console.warn("[v0] [Seed] Failed to initialize default settings:", error)
  }
}

export async function runPreStartup() {
  try {
    console.log("[v0] ==========================================")
    console.log("[v0] PRE-STARTUP INITIALIZATION STARTED")
    console.log("[v0] ==========================================")
    
    console.log("[v0] [1/5] Initializing Redis...")
    await initRedis()
    console.log("[v0] [1/5] ✓ Redis initialized")
    
    console.log("[v0] [2/5] Running database migrations...")
    await runMigrations()
    console.log("[v0] [2/5] ✓ Migrations completed")
    
    console.log("[v0] [3/5] Initializing settings...")
    await initializeDefaultSettings()
    console.log("[v0] [3/5] ✓ Settings initialized")
    
    console.log("[v0] [4/5] Seeding exchange connections...")
    await seedPredefinedConnections()
    console.log("[v0] [4/5] ✓ Connections seeded")
    
    console.log("[v0] [5/5] Seeding market data...")
    await seedMarketData()
    console.log("[v0] [5/5] ✓ Market data seeded")
    
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
