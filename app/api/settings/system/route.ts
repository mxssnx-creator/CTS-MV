import { type NextRequest, NextResponse } from "next/server"
import { successResponse, errorResponse } from "@/lib/api-toast"
import { getSettings, setSettings } from "@/lib/redis-db"

export async function GET(request: NextRequest) {
  try {
    const settings = await getSettings("system") || {}

    console.log("[v0] Loaded system settings from Redis:", Object.keys(settings).length, "keys")
    return NextResponse.json(settings)
  } catch (error) {
    console.error("[v0] Failed to fetch system settings:", error)
    return NextResponse.json({})
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    
    await setSettings("system", body)
    console.log("[v0] System settings saved to Redis")
    
    return NextResponse.json({ success: true, data: body })
  } catch (error) {
    console.error("[v0] Failed to save system settings:", error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

    console.log("[v0] Updating system settings:", Object.keys(body))

    const currentSettings = loadSettings()
    const oldDbType = currentSettings.database_type
    const newDbType = body.database_type
    
    if (newDbType && newDbType !== oldDbType) {
      console.log(`[v0] ========================================`)
      console.log(`[v0] DATABASE TYPE CHANGE DETECTED`)
      console.log(`[v0] Old type: ${oldDbType}`)
      console.log(`[v0] New type: ${newDbType}`)
      console.log(`[v0] ========================================`)
    }
    
    const updatedSettings = { ...currentSettings, ...body }
    saveSettings(updatedSettings)
    console.log("[v0] Settings saved to file successfully")

    // Reset database connections if type changed
    if (newDbType && newDbType !== oldDbType) {
      console.log("[v0] Resetting database clients...")
      resetDatabaseClients()
      console.log("[v0] Database clients reset successfully")
      console.log("[v0] System will reconnect using new database type on next query")
      
      // Also update environment variable for current process
      process.env.DATABASE_TYPE = newDbType
      console.log("[v0] Environment variable DATABASE_TYPE updated to:", newDbType)
    }

    const updatedCount = Object.keys(body).length

    return successResponse(
      { success: true, updated: updatedCount, dbTypeChanged: newDbType !== oldDbType }, 
      `Successfully updated ${updatedCount} setting(s)${newDbType !== oldDbType ? '. Database type changed - system will reconnect.' : ''}`
    )
  } catch (error) {
    console.error("[v0] Failed to update system settings:", error)
    return errorResponse("Failed to update settings", "Settings Save Failed", "Could not save settings to file", 500)
  }
}
