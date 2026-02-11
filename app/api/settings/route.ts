import { NextResponse } from "next/server"
import { loadSettingsAsync, saveSettings as saveSettingsToFile } from "@/lib/settings-storage"

export const runtime = "nodejs"

export async function GET() {
  try {
    console.log("[v0] GET /api/settings - Loading settings from file...")

    const settings = await loadSettingsAsync()
    
    console.log("[v0] Settings loaded successfully from file:", Object.keys(settings).length, "keys")
    return NextResponse.json({ settings })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Failed to get settings from file:", errorMsg)

    return NextResponse.json({ error: "Failed to load settings", details: errorMsg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    console.log("[v0] Saving settings to file (POST):", Object.keys(body).length, "keys")

    saveSettingsToFile(body)

    console.log("[v0] Settings saved successfully to file")

    return NextResponse.json({ success: true })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Failed to save settings to file:", errorMsg)

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

    console.log("[v0] Saving settings to file (PUT):", Object.keys(settings).length, "keys")

    // Get existing settings and merge with new ones
    const existingSettings = await loadSettingsAsync()
    const mergedSettings = { ...existingSettings, ...settings }
    
    saveSettingsToFile(mergedSettings)

    console.log("[v0] Settings updated successfully to file")

    return NextResponse.json({ success: true, settings: mergedSettings })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Failed to update settings to file:", errorMsg)

    return NextResponse.json(
      { error: "Failed to update settings", details: errorMsg },
      { status: 500 },
    )
  }
}
