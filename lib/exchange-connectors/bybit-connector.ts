import crypto from "crypto"
import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"
import { safeParseResponse } from "@/lib/safe-response-parser"

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
      this.log(`Using account type: ${accountType}`)

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
