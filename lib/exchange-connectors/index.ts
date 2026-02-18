/**
 * Exchange Connector Factory
 * Creates appropriate connector based on exchange name
 * Falls back to CCXT for any supported exchange
 * NOTE: CCXT connector is server-only and loaded dynamically
 */

import type { BaseExchangeConnector, ExchangeCredentials } from "./base-connector"
import { BybitConnector } from "./bybit-connector"
import { BingXConnector } from "./bingx-connector"
import { PionexConnector } from "./pionex-connector"
import { OrangeXConnector } from "./orangex-connector"
import { BinanceConnector } from "./binance-connector"
import { OKXConnector } from "./okx-connector"
import { EXCHANGE_API_TYPES } from "@/lib/connection-predefinitions"

const CCXT_SUPPORTED = [
  "gateio",
  "mexc",
  "kucoin",
  "huobi",
  "kraken",
  "coinbase",
  "crypto.com",
  "dydx",
  "hyperliquid",
  "polymarket",
]

export async function createExchangeConnector(
  exchange: string,
  credentials: ExchangeCredentials
): Promise<BaseExchangeConnector> {
  const normalizedExchange = exchange.toLowerCase().replace(/[^a-z]/g, "")

  // Validate API type is supported for the exchange
  if (credentials.apiType) {
    const supported = EXCHANGE_API_TYPES[normalizedExchange]
    if (supported && !supported.includes(credentials.apiType)) {
      throw new Error(
        `Invalid API type '${credentials.apiType}' for ${exchange}. Supported types: ${supported.join(", ")}`
      )
    }
  }

  switch (normalizedExchange) {
    case "bybit":
      return new BybitConnector(credentials, "bybit")
    case "bingx":
      return new BingXConnector(credentials, "bingx")
    case "pionex":
      return new PionexConnector(credentials, "pionex")
    case "orangex":
      return new OrangeXConnector(credentials, "orangex")
    case "binance":
      return new BinanceConnector(credentials, "binance")
    case "okx":
      return new OKXConnector(credentials, "okx")
    // CCXT fallback for any other supported exchange (server-side only)
    default:
      if (CCXT_SUPPORTED.includes(normalizedExchange)) {
        // Dynamic import - only works on server
        const { CCXTConnector } = await import("./ccxt-connector")
        return new CCXTConnector(credentials, exchange)
      }

      throw new Error(
        `Unsupported exchange: ${exchange}. Supported exchanges: bybit, bingx, pionex, orangex, binance, okx, ${CCXT_SUPPORTED.join(", ")}`
      )
  }
}

export type { ExchangeConnectorResult, ExchangeCredentials } from "./base-connector"
export { BaseExchangeConnector } from "./base-connector"
