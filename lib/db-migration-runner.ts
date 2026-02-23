"use server"

// Redis-based migrations - old SQLite file preserved for compatibility

export async function runAllMigrations() {
  return {
    success: true,
    applied: 0,
    skipped: 0,
    failed: 0,
    message: "Redis migrations handled automatically by redis-migrations.ts",
  }
}


    let applied = 0
    let skipped = 0
    let failed = 0

    console.log(`[v0] Executing ${createTableStatements.length} CREATE TABLE statements...`)
    console.log(`[v0] Executing ${otherStatements.length} other statements...`)
    console.log(`[v0] Executing ${createIndexStatements.length} CREATE INDEX statements...`)

    for (let i = 0; i < orderedStatements.length; i++) {
      const statement = orderedStatements[i]
      try {
        if (statement.trim()) {
          await execute(statement, [])
          applied++
          
          // Record each SQL statement as a migration for accurate count
          try {
            const stmtType = statement.trim().split(/\s+/)[0].toUpperCase()
            const stmtPreview = statement.substring(0, 50).replace(/\s+/g, " ").trim()
            const migrationName = `unified_${i.toString().padStart(3, '0')}_${stmtType}_${stmtPreview.substring(0, 40)}`
            
            const existing = await query(
              "SELECT COUNT(*) as count FROM migrations WHERE name = ?",
              [migrationName]
            )
            
            if (existing[0]?.count === 0) {
              await execute(
                "INSERT INTO migrations (name, executed_at) VALUES (?, CURRENT_TIMESTAMP)",
                [migrationName]
              )
            }
          } catch (migError) {
            // Silently ignore migration tracking errors - not critical
          }
        }
      } catch (error: any) {
        const errorMsg = error?.message || String(error)
        const stmtPreview = statement.substring(0, 80).replace(/\s+/g, " ")
        
        // Only skip errors that indicate the object already exists
        if (
          errorMsg.includes("already exists") ||
          errorMsg.includes("duplicate column") ||
          errorMsg.includes("UNIQUE constraint")
        ) {
          skipped++
        } else if (errorMsg.includes("no such table")) {
          // Table doesn't exist - skip index creation
          console.log(`[v0] Skipping index (table missing): ${stmtPreview}`)
          skipped++
        } else {
          // Log real errors
          console.error(`[v0] Migration error: ${errorMsg}`)
          console.error(`[v0] Statement: ${stmtPreview}`)
          failed++
          // Continue with other migrations
        }
      }
    }

    const duration = Date.now() - startTime
    const success = failed === 0
    console.log(`[v0] Migration complete: ${applied} applied, ${skipped} skipped, ${failed} failed in ${duration}ms`)

    return {
      success,
      applied,
      skipped,
      failed,
      message: success 
        ? `Successfully executed ${applied} statements, ${skipped} skipped`
        : `Executed ${applied} statements, ${skipped} skipped, ${failed} failed`,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[v0] Migration failed:`, errorMsg)
    return {
      success: false,
      applied: 0,
      skipped: 0,
      failed: 1,
      message: `Migration failed: ${errorMsg}`,
    }
  }
}
