import crypto from "crypto"
import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"
import { safeParseResponse } from "@/lib/safe-response-parser"

export class PionexConnector extends BaseExchangeConnector {
  private getBaseUrl(): string {
    return "https://api.pionex.com"
  }

  getCapabilities(): string[] {
    return ["futures", "perpetual_futures", "leverage", "hedge_mode", "cross_margin"]
  }

  async testConnection(): Promise<ExchangeConnectorResult> {
    this.log("Starting Pionex connection test")
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

  /**
   * Generate Pionex API signature per official docs:
   * 1. Sort query params by key in ASCII order (including timestamp)
   * 2. Build: METHOD + PATH + ? + sorted_query_string
   * 3. For POST/DELETE with body, append body JSON after step 2
   * 4. HMAC-SHA256 with API Secret, send as PIONEX-SIGNATURE header
   */
  private generateSignature(method: string, path: string, params: Record<string, string>, body?: string): string {
    // Sort params by key in ascending ASCII order
    const sortedKeys = Object.keys(params).sort()
    const queryString = sortedKeys.map((k) => `${k}=${params[k]}`).join("&")

    // Build the string to sign: METHOD + PATH?sorted_query
    let stringToSign = `${method}${path}?${queryString}`

    // For POST/DELETE with body, append the body
    if (body) {
      stringToSign += body
    }

    return crypto.createHmac("sha256", this.credentials.apiSecret).update(stringToSign).digest("hex")
  }

  async getBalance(): Promise<ExchangeConnectorResult> {
    const timestamp = Date.now().toString()
    const baseUrl = this.getBaseUrl()
    const method = "GET"
    const path = "/api/v1/account/balances"

    this.log("Generating signature...")

    try {
      const params: Record<string, string> = { timestamp }
      const signature = this.generateSignature(method, path, params)

      // Build sorted query string for the URL
      const sortedKeys = Object.keys(params).sort()
      const queryString = sortedKeys.map((k) => `${k}=${params[k]}`).join("&")

      this.log("Fetching account balance...")

      const response = await this.rateLimitedFetch(
        `${baseUrl}${path}?${queryString}`,
        {
          method,
          headers: {
            "PIONEX-KEY": this.credentials.apiKey,
            "PIONEX-SIGNATURE": signature,
          },
        },
      )

      const data = await safeParseResponse(response)

      // Check for error responses
      if (!response.ok || data.error || data.result === false) {
        const errorMsg = data.error || data.message || `HTTP ${response.status}: ${response.statusText}`
        this.logError(`API Error: ${errorMsg}`)
        throw new Error(errorMsg)
      }

      this.log("Successfully retrieved account data")

      const balanceData = data.data?.balances || []
      const usdtBalance = Number.parseFloat(balanceData.find((b: any) => b.coin === "USDT")?.free || "0")

      const balances = balanceData.map((b: any) => ({
        asset: b.coin,
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
