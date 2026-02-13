import { NextResponse } from "next/server"
import { getSettings, setSettings, initRedis } from "@/lib/redis-db"

export const runtime = "nodejs"

export async function GET() {
  try {
    console.log("[v0] GET /api/settings - Loading settings from Redis...")

    // Initialize Redis connection first
    await initRedis()

    const settings = await getSettings("app_settings")
    
    if (!settings) {
      console.warn("[v0] No settings found in Redis, returning empty settings")
      return NextResponse.json({ settings: {} })
    }
    
    console.log("[v0] Settings loaded successfully from Redis:", Object.keys(settings).length, "keys")
    return NextResponse.json({ settings })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Failed to get settings from Redis:", errorMsg)

    return NextResponse.json({ error: "Failed to load settings", details: errorMsg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    console.log("[v0] Saving settings to Redis (POST):", Object.keys(body).length, "keys")

    // Initialize Redis connection first
    await initRedis()

    await setSettings("app_settings", body)

    console.log("[v0] Settings saved successfully to Redis")

    return NextResponse.json({ success: true })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Failed to save settings to Redis:", errorMsg)

    return NextResponse.json(
      { error: "Failed to update settings", details: errorMsg },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const settings = body.settings || body

    console.log("[v0] Saving settings to Redis (PUT):", Object.keys(settings).length, "keys")

    // Initialize Redis connection first
    await initRedis()

    // Get existing settings and merge with new ones
    const existingSettings = (await getSettings("app_settings")) || {}
    const mergedSettings = { ...existingSettings, ...settings }
    
    await setSettings("app_settings", mergedSettings)

    console.log("[v0] Settings updated successfully in Redis")

    return NextResponse.json({ success: true, settings: mergedSettings })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Failed to update settings in Redis:", errorMsg)

    return NextResponse.json(
      { error: "Failed to update settings", details: errorMsg },
      { status: 500 },
    )
  }
}
