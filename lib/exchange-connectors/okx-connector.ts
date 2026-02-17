import crypto from "crypto"
import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"

export class OKXConnector extends BaseExchangeConnector {
  private getBaseUrl(): string {
    return this.credentials.isTestnet ? "https://www.okx.com" : "https://www.okx.com"
  }

  getCapabilities(): string[] {
    return ["futures", "perpetual_futures", "spot", "leverage", "hedge_mode", "cross_margin", "isolated_margin"]
  }

  async testConnection(): Promise<ExchangeConnectorResult> {
    this.log("Starting OKX connection test")
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
    const timestamp = new Date().toISOString()
    const baseUrl = this.getBaseUrl()
    const apiType = this.credentials.apiType || "perpetual_futures"

    this.log(`API Type: ${apiType}`)
    this.log("Generating signature...")

    try {
      const method = "GET"
      // OKX uses different endpoints or filter parameters for different account types
      // /api/v5/account/balance returns balances for configured accounts
      // ccy parameter can filter by currency
      const requestPath = "/api/v5/account/balance"
      const body = ""
      const prehash = timestamp + method + requestPath + body
      const signature = crypto.createHmac("sha256", this.credentials.apiSecret).update(prehash).digest("base64")

      this.log("Fetching account balance...")
      console.log(`[v0] [OKX] API Type: ${apiType}`)

      const response = await this.rateLimitedFetch(`${baseUrl}${requestPath}`, {
        method: "GET",
        headers: {
          "OK-ACCESS-KEY": this.credentials.apiKey,
          "OK-ACCESS-SIGN": signature,
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": this.credentials.apiPassphrase || "",
          "Content-Type": "application/json",
        },
      })

      const data = await response.json()

      if (!response.ok || data.code !== "0") {
        this.logError(`API Error: ${data.msg || "Unknown error"}`)
        throw new Error(data.msg || "OKX API error")
      }

      this.log("Successfully retrieved account data")

      // OKX returns account details with balances for each currency
      const details = data.data?.[0]?.details || []
      const usdtDetail = details.find((d: any) => d.ccy === "USDT")
      const usdtBalance = Number.parseFloat(usdtDetail?.eq || "0") // eq = equity (total balance)

      this.log(`USDT Equity (Total): ${usdtBalance.toFixed(2)}`)
      this.log(`USDT Available: ${Number.parseFloat(usdtDetail?.availBal || "0").toFixed(2)}`)
      this.log(`USDT Frozen: ${Number.parseFloat(usdtDetail?.frozenBal || "0").toFixed(2)}`)

      const balances = details.map((d: any) => ({
        asset: d.ccy,
        free: Number.parseFloat(d.availBal || "0"), // Available balance
        locked: Number.parseFloat(d.frozenBal || "0"), // Frozen/locked balance
        total: Number.parseFloat(d.eq || "0"), // Total equity
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
