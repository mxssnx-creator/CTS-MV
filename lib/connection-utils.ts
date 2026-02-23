/**
 * Connection Utilities
 * Centralized logic for determining connection types and states.
 * 
 * CONNECTION HIERARCHY:
 * 1. PREDEFINED TEMPLATES (11 total): All connections seeded by migrations
 * 2. BASE CONNECTIONS (4): Primary exchanges enabled by default (bybit, bingx, pionex, orangex)
 *    - These are predefined BUT also "inserted" - they are the working base connections
 *    - They appear in Settings as enabled connections
 * 3. TEMPLATE-ONLY (7): Secondary exchanges (binance, okx, gateio, kucoin, mexc, bitget, huobi)
 *    - Just informational templates, not active unless user explicitly enables them
 * 4. ACTIVE CONNECTIONS: Base connections that are activated (is_enabled_dashboard field in Redis)
 *    - INDEPENDENT status from base Settings connections
 *    - Trade engine processes ONLY active connections
 */

// The 4 primary/base exchanges that are "inserted" and enabled by default
export const BASE_EXCHANGES = ["bybit", "bingx", "pionex", "orangex"]

// All known exchanges (base + templates)
export const ALL_EXCHANGES = ["bybit", "bingx", "pionex", "orangex", "binance", "okx", "gateio", "kucoin", "mexc", "bitget", "huobi"]

/**
 * Check if a connection is a BASE connection (one of the 4 primary exchanges)
 * Uses the `exchange` field for reliable matching regardless of is_inserted state
 */
export function isBaseConnection(connection: any): boolean {
  if (!connection) return false
  const exchange = (connection.exchange || "").toLowerCase().trim()
  return BASE_EXCHANGES.includes(exchange)
}

/**
 * Check if a connection is a template-only connection (NOT a base connection)
 */
export function isTemplateOnlyConnection(connection: any): boolean {
  if (!connection) return true
  return !isBaseConnection(connection)
}

/**
 * Check if a connection is enabled in Settings (base connection level)
 * Fallback: base connections are enabled by default
 */
export function isConnectionEnabled(connection: any): boolean {
  if (!connection) return false
  // Check explicit is_enabled field
  const isEnabled = connection.is_enabled === true || connection.is_enabled === "1" || connection.is_enabled === "true"
  // Fallback: base connections are enabled by default even if field is missing/corrupted
  if (!isEnabled && isBaseConnection(connection)) {
    // If is_enabled was never set or was corrupted, base connections default to enabled
    return connection.is_enabled === undefined || connection.is_enabled === null
  }
  return isEnabled
}

/**
 * Check if a connection is active on the Dashboard
 */
export function isConnectionActiveDashboard(connection: any): boolean {
  if (!connection) return false
  return connection.is_enabled_dashboard === true || connection.is_enabled_dashboard === "1" || connection.is_enabled_dashboard === "true"
}

/**
 * Filter connections to only base connections (the 4 primary exchanges)
 */
export function filterBaseConnections(connections: any[]): any[] {
  return connections.filter(isBaseConnection)
}

/**
 * Filter connections to only template-only connections
 */
export function filterTemplateConnections(connections: any[]): any[] {
  return connections.filter(isTemplateOnlyConnection)
}

/**
 * Filter connections to base connections that are enabled (for Active Connections listing)
 */
export function filterEnabledBaseConnections(connections: any[]): any[] {
  return connections.filter(c => isBaseConnection(c) && isConnectionEnabled(c))
}

/**
 * Filter connections to dashboard-active connections (for trade engine processing)
 */
export function filterDashboardActiveConnections(connections: any[]): any[] {
  return connections.filter(isConnectionActiveDashboard)
}
