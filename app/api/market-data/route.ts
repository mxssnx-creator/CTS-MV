import { NextResponse, type NextRequest } from "next/server"
import { initRedis, getSettings, setSettings, getClient } from "@/lib/redis-db"
import { loadMarketDataForEngine, loadHistoricalMarketData, updateMarketDataForSymbol } from "@/lib/market-data-loader"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * GET /api/market-data
 * Retrieve stored market data for a symbol or list all available symbols
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const symbol = searchParams.get("symbol")
    const action = searchParams.get("action") || "get"

    await initRedis()

    if (action === "list") {
      // List all symbols with market data
      const client = getClient()
      const keys = await client.keys("market_data:*:1m")
      const symbols = keys
        .map((key: string) => key.split(":")[1])
        .filter((s: string) => s && !s.includes("candles"))
      
      return NextResponse.json({
        success: true,
        action: "list",
        symbolCount: symbols.length,
        symbols: [...new Set(symbols)],
      })
    }

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "Symbol query parameter is required" },
        { status: 400 }
      )
    }

    // Get market data for specific symbol
    const client = getClient()
    const key = `market_data:${symbol}:1m`
    const data = await client.get(key)

    if (!data) {
      return NextResponse.json(
        { success: false, error: `No market data found for ${symbol}. Use POST to load data.` },
        { status: 404 }
      )
    }

    const marketData = JSON.parse(data)
    return NextResponse.json({
      success: true,
      symbol,
      timeframe: marketData.timeframe,
      candleCount: marketData.candles.length,
      lastUpdated: marketData.lastUpdated,
      latestCandle: marketData.candles[marketData.candles.length - 1],
      oldestCandle: marketData.candles[0],
    })
  } catch (error) {
    console.error("[v0] Market data GET error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch market data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/market-data
 * Load market data for symbols (realtime or historical)
 */
export async function POST(request: NextRequest) {
  try {
    await initRedis()
    const body = await request.json()
    const {
      action = "load",
      symbols = [],
      symbol,
      startDate,
      endDate,
      timeframe = "1h",
    } = body

    console.log(`[v0] [API] Market data action: ${action}`)

    if (action === "load" || action === "initialize") {
      // Load market data for all symbols
      const targetSymbols = symbols.length > 0 ? symbols : undefined
      const loaded = await loadMarketDataForEngine(targetSymbols)

      return NextResponse.json({
        success: true,
        action: "load",
        symbolsLoaded: loaded,
        message: `Loaded market data for ${loaded} symbols`,
      })
    } else if (action === "historical") {
      if (!symbol || !startDate || !endDate) {
        return NextResponse.json(
          { success: false, error: "symbol, startDate, and endDate are required for historical action" },
          { status: 400 }
        )
      }

      const start = new Date(startDate)
      const end = new Date(endDate)

      // Load historical data
      const candles = await loadHistoricalMarketData(symbol, start, end, timeframe)

      if (candles.length === 0) {
        return NextResponse.json(
          { success: false, error: `Failed to load historical data for ${symbol}` },
          { status: 400 }
        )
      }

      // Store in Redis
      const client = getClient()
      const key = `market_data:${symbol}:${timeframe}:historical`
      await client.set(
        key,
        JSON.stringify({
          symbol,
          timeframe,
          candles,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          loadedAt: new Date().toISOString(),
        })
      )
      await client.expire(key, 604800) // 7 day TTL

      return NextResponse.json({
        success: true,
        action: "historical",
        symbol,
        timeframe,
        candleCount: candles.length,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        message: `Loaded ${candles.length} ${timeframe} candles for ${symbol}`,
      })
    } else if (action === "update") {
      if (!symbol) {
        return NextResponse.json(
          { success: false, error: "symbol is required for update action" },
          { status: 400 }
        )
      }

      await updateMarketDataForSymbol(symbol)

      return NextResponse.json({
        success: true,
        action: "update",
        symbol,
        message: `Updated market data for ${symbol}`,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid action: ${action}. Use 'load', 'historical', or 'update'`,
        },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error("[v0] Market data POST error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process market data request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
