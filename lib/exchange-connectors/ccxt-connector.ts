/**
 * CCXT Exchange Connector
 * Universal connector supporting any exchange via CCXT library
 * https://github.com/ccxt/ccxt
 */

import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"

export class CCXTConnector extends BaseExchangeConnector {
  private exchange: string
  private ccxtInstance: any = null

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
    this.timeout = 15000 // CCXT may need more time for initialization
  }

  private async initializeCCXT(): Promise<any> {
    if (this.ccxtInstance) {
      return this.ccxtInstance
    }

    try {
      // Dynamic import of CCXT
      const ccxt = await import("ccxt")

      const ExchangeClass = (ccxt as any)[this.exchange]

      if (!ExchangeClass) {
        throw new Error(`Exchange ${this.exchange} not supported by CCXT`)
      }

      this.log(`Initializing CCXT connector for ${this.exchange}`)

      const exchangeConfig: any = {
        apiKey: this.credentials.apiKey,
        secret: this.credentials.apiSecret,
        enableRateLimit: true,
        timeout: this.timeout,
      }

      // Add passphrase if provided (for exchanges like OKX, Kraken)
      if (this.credentials.apiPassphrase) {
        exchangeConfig.password = this.credentials.apiPassphrase
      }

      // Set testnet if supported
      if (this.credentials.isTestnet) {
        this.log(`Using testnet environment for ${this.exchange}`)
        if (this.exchange === "binance") {
          exchangeConfig.urls = {
            api: {
              public: "https://testnet.binance.vision/api",
              private: "https://testnet.binance.vision/api",
            },
          }
        } else if (this.exchange === "okx") {
          exchangeConfig.urls = {
            api: {
              public: "https://www.okx.com",
              private: "https://www.okx.com",
            },
          }
          exchangeConfig.sandbox = true
        } else if (this.exchange === "bybit") {
          exchangeConfig.urls = {
            api: {
              public: "https://api-testnet.bybit.com",
              private: "https://api-testnet.bybit.com",
            },
          }
        }
        // Most exchanges support sandbox/testnet via URLs property
        exchangeConfig.sandbox = true
      }

      this.ccxtInstance = new ExchangeClass(exchangeConfig)
      this.log(`CCXT connector initialized successfully`)

      return this.ccxtInstance
    } catch (error) {
      this.logError(`Failed to initialize CCXT: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  async testConnection(): Promise<ExchangeConnectorResult> {
    this.log("Starting CCXT connection test")
    this.log(`Exchange: ${this.exchange}`)
    this.log(`Testnet: ${this.credentials.isTestnet ? "Yes" : "No"}`)

    try {
      const exchange = await this.initializeCCXT()

      // Test basic connectivity by fetching balance
      this.log("Fetching account balance...")

      const balance = await exchange.fetch_balance()

      this.log("Connection successful")
      return await this.getBalance()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logError(errorMessage)

      // Provide helpful error messages
      let userMessage = errorMessage
      if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        userMessage = "Invalid API credentials - check your API key and secret"
      } else if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
        userMessage = "API access denied - check if IP whitelisting is configured"
      } else if (errorMessage.includes("not supported")) {
        userMessage = `Exchange ${this.exchange} is not available in CCXT or not installed`
      }

      return {
        success: false,
        balance: 0,
        capabilities: this.getCapabilities(),
        error: userMessage,
        logs: this.logs,
      }
    }
  }

  async getBalance(): Promise<ExchangeConnectorResult> {
    try {
      const exchange = await this.initializeCCXT()

      this.log("Fetching complete balance information...")

      const balance = await exchange.fetch_balance()

      // Extract USDT balance or total
      const usdtBalance = balance.USDT?.free || balance.USDT?.total || balance.total?.USDT || 0
      const totalBalance = Object.keys(balance)
        .filter((key) => key !== "free" && key !== "used" && key !== "total" && key !== "timestamp" && key !== "datetime")
        .reduce((sum: number, asset: string) => {
          const free = balance[asset]?.free || 0
          return sum + free
        }, 0)

      this.log(`Account Balance: ${usdtBalance.toFixed(2)} USDT`)
      this.log(`Total Assets: ${Object.keys(balance).length - 3} different assets`)

      // Format balances
      const balances = Object.keys(balance)
        .filter((key) => key !== "free" && key !== "used" && key !== "total" && key !== "timestamp" && key !== "datetime")
        .map((asset) => ({
          asset,
          free: balance[asset]?.free || 0,
          locked: balance[asset]?.used || 0,
          total: balance[asset]?.total || 0,
        }))
        .filter((b) => b.total > 0) // Only include non-zero balances

      return {
        success: true,
        balance: usdtBalance || totalBalance,
        balances,
        capabilities: this.getCapabilities(),
        logs: this.logs,
      }
    } catch (error) {
      this.logError(`Failed to fetch balance: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  getCapabilities(): string[] {
    const capabilities = [
      "universal",
      "spot",
      "margin",
      "derivatives",
      "futures",
      "options",
      "ccxt",
      "rate_limiting",
    ]

    // Exchange-specific capabilities
    switch (this.exchange) {
      case "bybit":
        capabilities.push("perpetual_futures", "unified", "hedge_mode", "cross_margin", "isolated_margin")
        break
      case "binance":
        capabilities.push("perpetual_futures", "cross_margin", "isolated_margin", "umargin")
        break
      case "okx":
        capabilities.push("perpetual_futures", "cross_margin", "isolated_margin", "portfolio_margin")
        break
      case "gateio":
        capabilities.push("perpetual_futures", "cross_margin", "isolated_margin")
        break
      case "mexc":
        capabilities.push("perpetual_futures", "cross_margin", "isolated_margin")
        break
      case "kucoin":
        capabilities.push("perpetual_futures", "cross_margin", "isolated_margin")
        break
      case "bingx":
        capabilities.push("perpetual_futures", "hedge_mode", "cross_margin")
        break
      case "pionex":
        capabilities.push("spot", "grid_trading")
        break
      case "huobi":
        capabilities.push("perpetual_futures", "cross_margin")
        break
      default:
        capabilities.push("basic_trading")
    }

    return [...new Set(capabilities)] // Remove duplicates
  }

  async getExchangeInfo(): Promise<any> {
    try {
      const exchange = await this.initializeCCXT()
      this.log("Fetching exchange information...")

      const info = {
        id: exchange.id,
        name: exchange.name,
        countries: exchange.countries,
        urls: exchange.urls,
        has: exchange.has,
        timeframes: exchange.timeframes,
        symbols: exchange.symbols?.length || 0,
      }

      return info
    } catch (error) {
      this.logError(`Failed to fetch exchange info: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  async getSymbols(): Promise<string[]> {
    try {
      const exchange = await this.initializeCCXT()
      this.log(`Loaded ${exchange.symbols?.length || 0} trading pairs`)
      return exchange.symbols || []
    } catch (error) {
      this.logError(`Failed to fetch symbols: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }
}
