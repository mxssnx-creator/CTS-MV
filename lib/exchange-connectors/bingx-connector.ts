import crypto from "crypto"
import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"
import { safeParseResponse } from "@/lib/safe-response-parser"

export class BingXConnector extends BaseExchangeConnector {
  private getBaseUrl(): string {
    return "https://open-api.bingx.com"
  }

  getCapabilities(): string[] {
    return ["futures", "perpetual_futures", "leverage", "hedge_mode", "cross_margin"]
  }

  async testConnection(): Promise<ExchangeConnectorResult> {
    this.log("Starting BingX connection test")
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
      // Build query parameters and sort them (BingX requirement)
      const params: Record<string, string> = {
        timestamp: String(timestamp),
      }

      // Sort parameters alphabetically and build query string
      const sortedKeys = Object.keys(params).sort()
      const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&')

      // Generate signature from the query string
      const signature = crypto.createHmac("sha256", this.credentials.apiSecret).update(queryString).digest("hex")

      this.log("Fetching account balance...")

      const response = await this.rateLimitedFetch(
        `${baseUrl}/openApi/swap/v3/user/balance?${queryString}&signature=${signature}`,
        {
          method: "GET",
          headers: {
            "X-BX-APIKEY": this.credentials.apiKey,
          },
        },
      )

      const data = await safeParseResponse(response)

      // Check for error responses or HTML error pages
      if (!response.ok || data.error || data.code !== 0) {
        const errorMsg = data.error || data.msg || `HTTP ${response.status}: ${response.statusText}`
        this.logError(`API Error: ${errorMsg}`)
        throw new Error(errorMsg)
      }

      this.log("Successfully retrieved account data")

      const balanceData = data.data?.balance || []
      const usdtBalance = Number.parseFloat(balanceData.find((b: any) => b.asset === "USDT")?.balance || "0")

      const balances = balanceData.map((b: any) => ({
        asset: b.asset,
        free: Number.parseFloat(b.availableMargin || "0"),
        locked: Number.parseFloat(b.frozenMargin || "0"),
        total: Number.parseFloat(b.balance || "0"),
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
