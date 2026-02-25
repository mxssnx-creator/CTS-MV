/**
 * CCXT Exchange Connector Stub
 * CCXT is not available in this environment.
 * All primary exchanges have dedicated connectors.
 * This stub is never imported at build time.
 */

export class CCXTConnector {
  constructor(_credentials: any, _exchange: string) {}
  async testConnection() {
    return { success: false, balance: 0, capabilities: [], error: "CCXT not available", logs: [] }
  }
  async getBalance() {
    return this.testConnection()
  }
  getCapabilities() {
    return []
  }
}
