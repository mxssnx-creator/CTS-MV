import { NextResponse } from "next/server"
import { initRedis, getSettings, setSettings } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

export const runtime = "nodejs"

export async function GET() {
  try {
    console.log("[v0] GET /api/settings - Loading settings from Redis...")
    await SystemLogger.logAPI("Loading system settings from Redis", "info", "GET /api/settings")

    await initRedis()
    
    // Load all settings from Redis (stored as individual keys with "settings:" prefix)
    const settings: Record<string, any> = {}
    
    // Get common settings keys
    const settingsKeys = [
      "global_position_size_multiplier",
      "global_risk_level",
      "max_simultaneous_trades",
      "default_leverage",
      "stop_loss_percentage",
      "take_profit_percentage",
      "trading_enabled",
      "notifications_enabled",
      "auto_compound",
      "trailing_stop_enabled",
      "max_drawdown_percentage",
    ]
    
    for (const key of settingsKeys) {
      try {
        const value = await getSettings(key)
        if (value !== null && value !== undefined) {
          settings[key] = value
        }
      } catch (error) {
        console.warn(`[v0] Failed to load setting ${key}:`, error)
      }
    }

    console.log("[v0] Settings loaded successfully from Redis:", Object.keys(settings).length, "keys")
    await SystemLogger.logAPI(`Settings loaded from Redis: ${Object.keys(settings).length} keys`, "info", "GET /api/settings")

    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[v0] Failed to get settings from Redis:", error)
    await SystemLogger.logError(error, "api", "GET /api/settings")

    // Return default settings on error
    return NextResponse.json({
      settings: {
        global_position_size_multiplier: 1.0,
        global_risk_level: "medium",
        max_simultaneous_trades: 5,
        trading_enabled: false,
      },
    })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    console.log("[v0] Saving settings to Redis:", Object.keys(body).length, "keys")
    await SystemLogger.logAPI(`Saving ${Object.keys(body).length} settings to Redis`, "info", "POST /api/settings")

    await initRedis()

    // Save each setting individually to Redis
    for (const [key, value] of Object.entries(body)) {
      try {
        await setSettings(key, value)
      } catch (error) {
        console.warn(`[v0] Failed to save setting ${key}:`, error)
      }
    }

    console.log("[v0] Settings saved successfully to Redis")
    await SystemLogger.logAPI("Settings saved successfully to Redis", "info", "POST /api/settings")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to update settings in Redis:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings")

    return NextResponse.json(
      { error: "Failed to update settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
