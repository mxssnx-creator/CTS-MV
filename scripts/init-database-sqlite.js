#!/usr/bin/env node

/**
 * init-database-sqlite.js - Deprecated
 * Redis is now the primary database with automatic initialization
 */

console.log("[v0] SQLite initialization: Deprecated (using Redis)")
process.exit(0)

    console.log()
    
    // Check for critical tables
    const criticalTables = [
      'exchange_connections',
      'trade_engine_state',
      'indications_direction',
      'indications_move',
      'indications_active',
      'strategies_base',
      'strategies_main',
      'preset_types',
      'configuration_sets'
    ]
    
    const tableNames = tables.map(t => t.name)
    const missingCritical = criticalTables.filter(t => !tableNames.includes(t))
    
    if (missingCritical.length > 0) {
      console.log("⚠ WARNING: Some critical tables are missing:")
      missingCritical.forEach(table => {
        console.log(`  ✗ ${table}`)
      })
      console.log()
    } else {
      console.log("✓ All critical tables present and ready")
      console.log()
    }
    
    db.close()
    
    console.log("=".repeat(60))
    console.log("✓ Database initialization completed successfully!")
    console.log("=".repeat(60))
    console.log()
    console.log("Next steps:")
    console.log("  • Start the application: npm run dev")
    console.log("  • Check database status: npm run db:status")
    console.log("  • View tables: npm run db:tables")
    console.log()
    
    return true
  } catch (error) {
    console.error()
    console.error("=".repeat(60))
    console.error("✗ Database initialization failed!")
    console.error("=".repeat(60))
    console.error()
    console.error("Error:", error.message)
    console.error()
    if (error.stack) {
      console.error("Stack trace:")
      console.error(error.stack)
      console.error()
    }
    
    return false
  }
}

// Run initialization
initializeDatabase().then(success => {
  process.exit(success ? 0 : 1)
})
