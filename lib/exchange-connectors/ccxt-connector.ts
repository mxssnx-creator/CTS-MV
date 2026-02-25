/**
 * CCXT Exchange Connector Stub
 * CCXT is not available in the v0 serverless environment.
 * All primary exchanges have dedicated connectors (Bybit, BingX, Pionex, OrangeX, Binance, OKX).
 * This stub returns a clear error for any unsupported exchange.
 */

import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"

export class CCXTConnector extends BaseExchangeConnector {
  private exchange: string

  constructor(
    credentials: {
      apiKey: string
      apiSecret: string
      apiPassphrase?: string
      isTestnet: boolean
    },
    exchange: string
  ) {
    super(credentials, exchange)
    this.exchange = exchange.toLowerCase()
  }

  async testConnection(): Promise<ExchangeConnectorResult> {
    return {
      success: false,
      balance: 0,
      capabilities: this.getCapabilities(),
      error: `Exchange "${this.exchange}" requires CCXT which is not available in this environment. Use a dedicated connector (bybit, bingx, pionex, orangex, binance, okx) instead.`,
      logs: [`CCXT not available - exchange ${this.exchange} not supported in this environment`],
    }
  }

  async getBalance(): Promise<ExchangeConnectorResult> {
    return this.testConnection()
  }

  getCapabilities(): string[] {
    return ["stub", "unavailable"]
  }
}
