/**
 * Background Database Initializer - Non-blocking
 */

export async function initializeDatabase(): Promise<void> {
  try {
    const { getClient, getDatabaseType } = await import("./db")
    const dbType = getDatabaseType()

    if (dbType !== "sqlite") {
      return
    }

    const client = getClient() as any
    const result = client.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get()
    const tableCount = result?.count || 0

    if (tableCount >= 10) {
      return
    }

    try {
      const fs = (await import("fs")) as any
      const path = (await import("path")) as any
      
      const sqlPath = path.join(process.cwd(), "scripts", "unified_complete_setup.sql")
      if (!fs.existsSync(sqlPath)) {
        return
      }

      const sql = fs.readFileSync(sqlPath, "utf-8")
      const statements = Array.isArray(sql) ? sql : sql
        .split(";")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 10)

      if (!Array.isArray(statements) || statements.length === 0) {
        return
      }

      for (const stmt of statements) {
        try {
          client.prepare(stmt).run()
        } catch (e) {
          // Ignore errors
        }
      }
    } catch (e) {
      // Optional initialization
    }
  } catch (error) {
    // Silently fail
  }
}
