/**
 * Pre-startup: Initialize Redis and run all critical setup tasks
 * Runs once on first deploy or server start
 */

import { initRedis, setSettings, createConnection, getAllConnections, saveMarketData } from "@/lib/redis-db"
import { runMigrations } from "@/lib/redis-migrations"
import { getPredefinedConnectionsAsStatic } from "@/lib/connection-predefinitions"

async function seedMarketData() {
  console.log("[v0] Seeding market data...")

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
  for (const symbol of symbols) {
    try {
      const basePrice = basePrices[symbol] || 100
      // Seed 10 historical data points
      for (let i = 0; i < 10; i++) {
        const variation = basePrice * 0.02
        const marketData = {
          symbol,
          exchange: "bybit",
          interval: "1m",
          price: basePrice + (Math.random() - 0.5) * variation,
          open: basePrice,
          high: basePrice + variation,
          low: basePrice - variation,
          close: basePrice + (Math.random() - 0.5) * variation,
          volume: Math.random() * 1000000,
          timestamp: new Date(Date.now() - (10 - i) * 60000).toISOString(),
        }
        await saveMarketData(symbol, marketData)
      }
      seededCount++
    } catch (error) {
      console.warn(`[v0] Failed to seed market data for ${symbol}:`, error)
    }
  }
  console.log(`[v0] Seeded market data for ${seededCount}/${symbols.length} symbols`)
}

async function seedPredefinedConnections() {
  console.log("[v0] Seeding predefined connections...")
  try {
    const predefined = getPredefinedConnectionsAsStatic()
    const existing = await getAllConnections() || []
    let seededCount = 0
    
    for (const conn of predefined) {
      try {
        const exists = existing.some((c: any) => c.id === conn.id)
        if (!exists) {
          await createConnection(conn)
          seededCount++
        }
      } catch (error) {
        console.warn(`[v0] Failed to seed ${conn.name}:`, error)
      }
    }
    console.log(`[v0] Seeded ${seededCount} new predefined connections`)
  } catch (error) {
    console.error("[v0] Failed to seed predefined connections:", error)
  }
}

async function initializeDefaultSettings() {
  console.log("[v0] Initializing default settings...")
  try {
    const { getSettings } = await import("@/lib/redis-db")
    const existing = await getSettings("all_settings")
    
    if (!existing || Object.keys(existing).length === 0) {
      const defaults = {
        mainEngineIntervalMs: 60000,
        presetEngineIntervalMs: 120000,
        mainEngineEnabled: true,
        presetEngineEnabled: true,
        strategyUpdateIntervalMs: 10000,
        realtimeIntervalMs: 3000,
        minimum_connect_interval: 200,
        theme: "dark",
        language: "en",
        notifications_enabled: true,
      }
      await setSettings("all_settings", defaults)
      console.log("[v0] Default settings initialized")
    }
  } catch (error) {
    console.warn("[v0] Failed to initialize default settings:", error)
  }
}

export async function runPreStartup() {
  try {
    console.log("[v0] Running pre-startup initialization...")
    
    await initRedis()
    console.log("[v0] Redis initialized")
    
    await runMigrations()
    console.log("[v0] Migrations completed")
    
    await initializeDefaultSettings()
    await seedPredefinedConnections()
    await seedMarketData()
    
    console.log("[v0] Pre-startup complete - system ready")
  } catch (error) {
    console.error("[v0] Pre-startup error:", error)
    // Don't throw - allow app to continue with degraded functionality
  }
}
