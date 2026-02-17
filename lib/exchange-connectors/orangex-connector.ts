import crypto from "crypto"
import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"
import { safeParseResponse } from "@/lib/safe-response-parser"

export class OrangeXConnector extends BaseExchangeConnector {
  private getBaseUrl(): string {
    return "https://api.orangex.com"
  }

  getCapabilities(): string[] {
    return ["futures", "perpetual_futures", "leverage", "cross_margin"]
  }

  async testConnection(): Promise<ExchangeConnectorResult> {
    this.log("Starting OrangeX connection test")
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
      const apiType = this.credentials.apiType || "spot"
      let endpoint = "/v1/account/balance" // Default: spot

      // OrangeX uses different endpoints for spot vs perpetual/futures
      if (apiType === "spot") {
        endpoint = "/v1/account/balance"
        this.log("Contract Type: SPOT → Using /v1/account/balance")
        console.log("[v0] [OrangeX] Contract Type: SPOT → Endpoint: /v1/account/balance")
      } else if (apiType === "perpetual_futures" || apiType === "futures") {
        endpoint = "/v1/perpetual/account/balance"
        this.log("Contract Type: PERPETUAL FUTURES → Using /v1/perpetual/account/balance")
        console.log("[v0] [OrangeX] Contract Type: PERPETUAL → Endpoint: /v1/perpetual/account/balance")
      }

      const queryString = `timestamp=${timestamp}`
      const signature = crypto.createHmac("sha256", this.credentials.apiSecret).update(queryString).digest("hex")

      this.log("Fetching account balance...")

      const response = await this.rateLimitedFetch(
        `${baseUrl}${endpoint}?${queryString}&signature=${signature}`,
        {
          method: "GET",
          headers: {
            "X-CH-APIKEY": this.credentials.apiKey,
          },
        },
      )

      const data = await safeParseResponse(response)

      // Check for error responses or HTML error pages
      if (!response.ok || data.error || data.code !== "0") {
        const errorMsg = data.error || data.msg || `HTTP ${response.status}: ${response.statusText}`
        this.logError(`API Error: ${errorMsg}`)
        throw new Error(errorMsg)
      }

      this.log("Successfully retrieved account data")

      const balanceData = data.data || []
      const usdtBalance = Number.parseFloat(balanceData.find((b: any) => b.asset === "USDT")?.free || "0")

      const balances = balanceData.map((b: any) => ({
        asset: b.asset,
        free: Number.parseFloat(b.free || "0"),
        locked: Number.parseFloat(b.locked || "0"),
        total: Number.parseFloat(b.free || "0") + Number.parseFloat(b.locked || "0"),
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
