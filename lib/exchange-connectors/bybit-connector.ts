import crypto from "crypto"
import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"
import { safeParseResponse } from "@/lib/safe-response-parser"

/**
 * Bybit Exchange Connector (V5 Unified API)
 * 
 * Supported API Types (Contract Types):
 * - "unified": Unified Trading Account (default) - all contract types in one wallet
 * - "contract": Contract Trading Account - derivatives/futures only
 * - "spot": Spot Trading Account - spot trading only
 * - "inverse": Inverse perpetual contracts (deprecated in V5, use unified)
 * 
 * Documentation: https://bybit-exchange.github.io/docs/v5/intro
 * 
 * IMPORTANT: API Types are mapped to Bybit's accountType parameter:
 * - "unified" → accountType: UNIFIED (all trading in one account)
 * - "perpetual_futures"/"futures" → accountType: CONTRACT (derivatives only)
 * - "spot" → accountType: SPOT (spot trading only)
 * 
 * Balance Fields (all types use same structure):
 * - walletBalance: Total balance
 * - availableToWithdraw: Available balance
 * - locked: Frozen balance
 * 
 * Error Handling:
 * - Validates credentials (API key and secret required)
 * - Checks HTTP response status and retCode
 * - Catches JSON parsing errors
 * - Logs detailed error messages for debugging
 * 
 * Features:
 * - Unified trading account support
 * - Perpetual futures (up to 125x leverage)
 * - Spot trading
 * - Cross and isolated margin
 * - Hedge and one-way position modes
 * - Testnet support
 */
export class BybitConnector extends BaseExchangeConnector {
  private getBaseUrl(): string {
    return this.credentials.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com"
  }

  getCapabilities(): string[] {
    return [
      "unified",
      "perpetual_futures",
      "spot",
      "leverage",
      "hedge_mode",
      "trailing",
      "cross_margin",
      "isolated_margin",
    ]
  }

  async testConnection(): Promise<ExchangeConnectorResult> {
    this.log("Starting Bybit connection test")
    this.log(`Testnet: ${this.credentials.isTestnet ? "Yes" : "No"}`)
    this.log(`Using endpoint: ${this.getBaseUrl()}`)

    try {
      return await this.getBalance()
    } catch (error) {
      this.logError(error instanceof Error ? error.message : "Unknown error")
      return {
        success: false,
        balance: 0,
        capabilities: this.getCapabilities(),
        error: error instanceof Error ? error.message : "Connection test failed",
        logs: this.logs,
      }
    }
  }

  async getBalance(): Promise<ExchangeConnectorResult> {
    const timestamp = Date.now()
    const baseUrl = this.getBaseUrl()

    this.log("Generating signature...")

    try {
      const recvWindow = "5000"
      const queryString = `api_key=${this.credentials.apiKey}&recv_window=${recvWindow}&timestamp=${timestamp}`
      const signature = crypto.createHmac("sha256", this.credentials.apiSecret).update(queryString).digest("hex")

      this.log("Fetching account balance...")
      const accountType = this.getEffectiveAccountType()
      const configuredApiType = this.credentials.apiType || "not set"
      this.log(`Configured API Type: ${configuredApiType}`)
      this.log(`Using Bybit accountType: ${accountType}`)
      console.log(`[v0] [Bybit] API Type: ${configuredApiType} → accountType: ${accountType}`)

      // Bybit V5 API uses accountType parameter: UNIFIED, CONTRACT, SPOT
      // UNIFIED = all contracts in one account, CONTRACT = derivatives only, SPOT = spot only
      const apiType = this.credentials.apiType || "perpetual_futures"
      console.log(`[v0] [Bybit] API Type: ${apiType}, Account Type: ${accountType}`)
      this.log(`Using account type: ${accountType} for API type: ${apiType}`)
      
      const response = await this.rateLimitedFetch(`${baseUrl}/v5/account/wallet-balance?accountType=${accountType}`, {
        method: "GET",
        headers: {
          "X-BAPI-API-KEY": this.credentials.apiKey,
          "X-BAPI-SIGN": signature,
          "X-BAPI-TIMESTAMP": timestamp.toString(),
          "X-BAPI-RECV-WINDOW": recvWindow,
        },
        signal: AbortSignal.timeout(this.timeout),
      })

      const data = await safeParseResponse(response)

      // Check for error responses or HTML error pages
      if (!response.ok || data.error) {
        const errorMsg = data.error || data.retMsg || `HTTP ${response.status}: ${response.statusText}`
        this.logError(`API Error: ${errorMsg}`)
        throw new Error(errorMsg)
      }

      if (data.retCode !== 0) {
        this.logError(`API Error: ${data.retMsg || "Unknown error"}`)
        throw new Error(data.retMsg || "Bybit API error")
      }

      this.log("Successfully retrieved account data")

      const coins = data.result?.list?.[0]?.coin || []
      const usdtCoin = coins.find((c: any) => c.coin === "USDT")
      const usdtBalance = Number.parseFloat(usdtCoin?.walletBalance || "0")

      const balances = coins.map((c: any) => ({
        asset: c.coin,
        free: Number.parseFloat(c.availableToWithdraw || "0"),
        locked: Number.parseFloat(c.locked || "0"),
        total: Number.parseFloat(c.walletBalance || "0"),
      }))

      this.log(`Account Balance: ${usdtBalance.toFixed(2)} USDT`)

      return {
        success: true,
        balance: usdtBalance,
        balances,
        capabilities: this.getCapabilities(),
        logs: this.logs,
      }
    } catch (error) {
      this.logError(`Connection error: ${error instanceof Error ? error.message : "Unknown"}`)
      throw error
    }
  }
}
