/**
 * Background Database Initializer - Non-blocking
 * Safely initializes database tables if they don't exist
 */

export async function initializeDatabase(): Promise<void> {
  try {
    const { getClient, getDatabaseType } = await import("./db")
    const dbType = getDatabaseType()

    // Only run for SQLite
    if (dbType !== "sqlite") {
      return
    }

    const client = getClient() as any
    
    // Check if tables already exist
    const result = client.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get() as { count: number } | undefined
    const tableCount = result?.count || 0

    // If we have tables, initialization is complete
    if (tableCount >= 10) {
      return
    }

    // Try to read and execute SQL schema file
    try {
      const fs = (await import("fs")) as any
      const path = (await import("path")) as any
      
      const sqlPath = path.join(process.cwd(), "scripts", "unified_complete_setup.sql")
      if (!fs.existsSync(sqlPath)) {
        return
      }

      const sql = fs.readFileSync(sqlPath, "utf-8")
      if (!sql || typeof sql !== "string") {
        return
      }

      // Split SQL into individual statements
      const statementList = sql
        .split(";")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 10)

      // Execute each statement
      if (Array.isArray(statementList) && statementList.length > 0) {
        for (const stmt of statementList) {
          try {
            client.prepare(stmt).run()
          } catch (e) {
            // Ignore statement errors
          }
        }
      }
    } catch (e) {
      // Silent fail - database may already be initialized or schema file missing
    }
  } catch (error) {
    // Silent fail - database initialization is optional
  }
}
