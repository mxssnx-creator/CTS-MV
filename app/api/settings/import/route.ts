import { NextRequest, NextResponse } from "next/server"
import { initRedis, getRedisClient, getConnection, updateConnection, createConnection } from "@/lib/redis-db"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const content = await file.text()
    const lines = content.split("\n")

    await initRedis()
    const client = getRedisClient()

    let imported = 0
    let skipped = 0
    let errors = 0
    const errors_list: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        skipped++
        continue
      }

      try {
        const [key, ...valueParts] = trimmed.split("=")
        const actualKey = key.trim()
        const actualValue = valueParts.join("=").trim()

        if (!actualKey || !actualValue) {
          skipped++
          continue
        }

        // Check if this is a connection field (format: connection-id:field-name)
        if (actualKey.includes(":")) {
          const [connId, fieldName] = actualKey.split(":")
          const connection = await getConnection(connId)

          if (connection) {
            // Parse value (could be JSON string)
            let parsedValue: any = actualValue
            try {
              if (actualValue.startsWith("{") || actualValue.startsWith("[")) {
                parsedValue = JSON.parse(actualValue)
              }
            } catch {
              parsedValue = actualValue
            }

            const updated = {
              ...connection,
              [fieldName]: parsedValue,
            }
            await updateConnection(connId, updated)
            imported++
          }
        } else {
          // Regular setting - store in Redis
          let parsedValue: any = actualValue
          try {
            if (actualValue.startsWith("{") || actualValue.startsWith("[")) {
              parsedValue = JSON.parse(actualValue)
            }
          } catch {
            parsedValue = actualValue
          }

          await client.set(`settings:${actualKey}`, parsedValue)
          imported++
        }
      } catch (error) {
        errors++
        errors_list.push(`Line: ${trimmed} - ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    }

    console.log(`[v0] Import complete: ${imported} imported, ${skipped} skipped, ${errors} errors`)

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors,
      errors: errors_list,
      message: `Import complete: ${imported} items imported, ${skipped} skipped, ${errors} errors`,
    })
  } catch (error) {
    console.error("[v0] Failed to import settings:", error)
    return NextResponse.json(
      { error: "Failed to import settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
      }
      
      // Parse key = value format
      const match = trimmed.match(/^([^=]+)\s*=\s*(.+)$/)
      if (!match) {
        console.warn(`[v0] Invalid line format: ${trimmed}`)
        errors++
        continue
      }
      
      const key = match[1].trim()
      const valueStr = match[2].trim()
      
      try {
        // Parse the value
        let value: any = valueStr
        
        // Try to parse JSON arrays/objects
        if (valueStr && (valueStr.startsWith("[") || valueStr.startsWith("{"))) {
          try {
            value = JSON.parse(valueStr)
          } catch (e) {
            // Keep as string if JSON parse fails
          }
        } else if (valueStr === "true" || valueStr === "false") {
          // Parse booleans
          value = valueStr === "true"
        } else if (valueStr && !isNaN(Number(valueStr)) && valueStr !== "") {
          // Parse numbers
          value = Number(valueStr)
        }
        
        // Update setting
        updatedSettings[key] = value
        imported++
      } catch (error) {
        console.error(`[v0] Failed to import setting ${key}:`, error)
        errors++
      }
    }
    
    // Save all settings to file
    saveSettings(updatedSettings)
    
    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors,
      message: `Imported ${imported} settings, skipped ${skipped}, ${errors} errors`
    })
  } catch (error) {
    console.error("[v0] Failed to import settings:", error)
    return NextResponse.json(
      { error: "Failed to import settings" },
      { status: 500 }
    )
  }
}
