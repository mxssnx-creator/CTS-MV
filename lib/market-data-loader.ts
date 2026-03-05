/**
 * Market Data Loader
 * Populates Redis with OHLCV data for trading engine
 * Generates synthetic data based on realistic patterns or loads from sources
 */

import { getClient, initRedis } from "@/lib/redis-db"

export interface MarketDataCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MarketData {
  symbol: string
  timeframe: string // "1m", "5m", "15m", "1h", "4h", "1d"
  candles: MarketDataCandle[]
  lastUpdated: string
}

/**
 * Generate synthetic market data for a symbol
 * Creates realistic price movements for testing
 */
export function generateSyntheticCandles(
  symbol: string,
  basePrice: number,
  candleCount: number = 100
): MarketDataCandle[] {
  const candles: MarketDataCandle[] = []
  const now = Date.now()
  const candleInterval = 60000 // 1 minute in ms

  let lastClose = basePrice

  for (let i = candleCount; i > 0; i--) {
    const timestamp = now - i * candleInterval
    
    // Generate realistic price movement (±0.5% per candle)
    const change = (Math.random() - 0.5) * lastClose * 0.01
    const open = lastClose
    const close = Math.max(lastClose * 0.8, lastClose + change) // Prevent crashes
    const high = Math.max(open, close) * (1 + Math.random() * 0.005)
    const low = Math.min(open, close) * (1 - Math.random() * 0.005)
    const volume = Math.random() * 1000000

    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    })

    lastClose = close
  }

  return candles
}

/**
 * Load market data for all symbols into Redis
 * Called during engine initialization
 */
export async function loadMarketDataForEngine(symbols: string[] = []): Promise<number> {
  try {
    await initRedis()
    const client = getClient()

    // Default symbols if none provided
    const targetSymbols = symbols.length > 0 ? symbols : [
      "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT",
      "DOGEUSDT", "LINKUSDT", "LITUSDT", "THETAUSDT", "AVAXUSDT",
      "MATICUSDT", "SOLUSDT", "UNIUSDT", "APTUSDT", "ARBUSDT"
    ]

    // Base prices for each symbol (realistic values)
    const basePrices: Record<string, number> = {
      BTCUSDT: 45000,
      ETHUSDT: 2500,
      BNBUSDT: 600,
      XRPUSDT: 0.5,
      ADAUSDT: 0.8,
      DOGEUSDT: 0.12,
      LINKUSDT: 25,
      LITUSDT: 120,
      THETAUSDT: 2.5,
      AVAXUSDT: 35,
      MATICUSDT: 1.2,
      SOLUSDT: 140,
      UNIUSDT: 15,
      APTUSDT: 10,
      ARBUSDT: 1.8,
    }

    let loaded = 0

    console.log(`[v0] [MarketData] Generating market data for ${targetSymbols.length} symbols...`)

    for (const symbol of targetSymbols) {
      try {
        const basePrice = basePrices[symbol] || 100
        const candles = generateSyntheticCandles(symbol, basePrice, 250) // 250 candles ~4 hours of 1min data

        const marketData: MarketData = {
          symbol,
          timeframe: "1m",
          candles,
          lastUpdated: new Date().toISOString(),
        }

        const key = `market_data:${symbol}:1m`
        await client.set(key, JSON.stringify(marketData))
        await client.expire(key, 86400) // 24 hour TTL

        // Also store raw candles for quick access
        const candlesKey = `market_data:${symbol}:candles`
        await client.set(candlesKey, JSON.stringify(candles))
        await client.expire(candlesKey, 86400)

        loaded++
        console.log(`[v0] [MarketData] ✓ Loaded ${symbol}: ${candles.length} candles (base price: $${basePrice})`)
      } catch (error) {
        console.error(`[v0] [MarketData] Failed to load ${symbol}:`, error)
      }
    }

    console.log(`[v0] [MarketData] ✅ Successfully loaded market data for ${loaded}/${targetSymbols.length} symbols`)
    return loaded
  } catch (error) {
    console.error("[v0] [MarketData] Failed to load market data:", error)
    return 0
  }
}

/**
 * Update market data for a specific symbol
 * Simulates new candles arriving
 */
export async function updateMarketDataForSymbol(symbol: string, newCandles: MarketDataCandle[] = []): Promise<void> {
  try {
    await initRedis()
    const client = getClient()

    // Get existing data
    const key = `market_data:${symbol}:1m`
    const existing = await client.get(key)

    let marketData: MarketData = existing
      ? JSON.parse(existing)
      : {
          symbol,
          timeframe: "1m",
          candles: [],
          lastUpdated: new Date().toISOString(),
        }

    // Add new candles (keep last 250)
    if (newCandles.length > 0) {
      marketData.candles = [...marketData.candles, ...newCandles].slice(-250)
    } else {
      // Generate one new candle
      const lastCandle = marketData.candles[marketData.candles.length - 1]
      if (lastCandle) {
        const newCandle: MarketDataCandle = {
          timestamp: lastCandle.timestamp + 60000,
          open: lastCandle.close,
          close: lastCandle.close * (1 + (Math.random() - 0.5) * 0.01),
          high: lastCandle.close * (1 + Math.random() * 0.005),
          low: lastCandle.close * (1 - Math.random() * 0.005),
          volume: Math.random() * 1000000,
        }
        newCandle.high = Math.max(newCandle.open, newCandle.close, newCandle.high)
        newCandle.low = Math.min(newCandle.open, newCandle.close, newCandle.low)
        marketData.candles.push(newCandle)
      }
    }

    marketData.lastUpdated = new Date().toISOString()
    await client.set(key, JSON.stringify(marketData))
    await client.expire(key, 86400)
  } catch (error) {
    console.error(`[v0] [MarketData] Failed to update ${symbol}:`, error)
  }
}

/**
 * Load market data for a specific date range
 * For backtesting or historical data loading
 */
export async function loadHistoricalMarketData(
  symbol: string,
  startDate: Date,
  endDate: Date,
  timeframe: string = "1h"
): Promise<MarketDataCandle[]> {
  try {
    // For now, generate synthetic historical data
    // In production, this would fetch from a data provider
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const candlesPerDay = timeframe === "1h" ? 24 : timeframe === "4h" ? 6 : 1
    const totalCandles = daysDiff * candlesPerDay

    const candles = generateSyntheticCandles(symbol, 100, totalCandles)

    // Adjust timestamps to match the date range
    const startTimestamp = startDate.getTime()
    const interval = timeframe === "1h" ? 3600000 : timeframe === "4h" ? 14400000 : 86400000

    candles.forEach((candle, index) => {
      candle.timestamp = startTimestamp + index * interval
    })

    console.log(`[v0] [MarketData] Generated historical data for ${symbol}: ${candles.length} candles from ${startDate.toISOString()} to ${endDate.toISOString()}`)
    return candles
  } catch (error) {
    console.error("[v0] [MarketData] Failed to load historical data:", error)
    return []
  }
}
