import { NextResponse } from "next/server"
import { loadSettings, saveSettings as saveSettingsToFile } from "@/lib/settings-storage"
import { SystemLogger } from "@/lib/system-logger"

export const runtime = "nodejs"

export async function GET() {
  try {
    console.log("[v0] GET /api/settings - Loading settings from file...")
    await SystemLogger.logAPI("Loading system settings from file", "info", "GET /api/settings")

    const settings = loadSettings()
    
    console.log("[v0] Settings loaded successfully from file:", Object.keys(settings).length, "keys")
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[v0] Failed to get settings from file:", error)
    await SystemLogger.logError(error, "api", "GET /api/settings")

    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    console.log("[v0] Saving settings to file:", Object.keys(body).length, "keys")
    await SystemLogger.logAPI(`Saving ${Object.keys(body).length} settings to file`, "info", "POST /api/settings")

    saveSettingsToFile(body)

    console.log("[v0] Settings saved successfully to file")
    await SystemLogger.logAPI("Settings saved successfully to file", "info", "POST /api/settings")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to save settings to file:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings")

    return NextResponse.json(
      { error: "Failed to update settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
