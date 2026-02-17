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

    this.log("Generating signature...")

    try {
      const method = "GET"
      const requestPath = "/api/v5/account/balance"
      const body = ""
      const prehash = timestamp + method + requestPath + body
      const signature = crypto.createHmac("sha256", this.credentials.apiSecret).update(prehash).digest("base64")

      const apiType = this.credentials.apiType || "perpetual_futures"
      const accountType = this.getEffectiveOKXAccountType(apiType)
      
      this.log(`Configured API Type: ${apiType}`)
      this.log(`Using OKX accountType: ${accountType}`)
      console.log(`[v0] [OKX] API Type: ${apiType} → accountType: ${accountType}`)

      this.log("Fetching account balance...")

      // OKX API v5 supports acctType parameter to filter by account type
      // FUNDING = funding account, TRADING = trading account, MARGIN = margin account, FUTURES = perpetual/futures
      const response = await this.rateLimitedFetch(`${baseUrl}${requestPath}?acctType=${accountType}`, {
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

      // Parse balance from the response
      // OKX returns details array with all holdings in the account
      const details = data.data?.[0]?.details || []
      const usdtDetail = details.find((d: any) => d.ccy === "USDT")
      const usdtBalance = Number.parseFloat(usdtDetail?.eq || "0")

      const balances = details.map((d: any) => ({
        asset: d.ccy,
        free: Number.parseFloat(d.availBal || "0"),
        locked: Number.parseFloat(d.frozenBal || "0"),
        total: Number.parseFloat(d.eq || "0"),
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

  /**
   * Map contract type to OKX accountType parameter
   * OKX account types: FUNDING (funding account), TRADING (spot/margin), MARGIN (margin trading), FUTURES (perpetual/swap)
   */
  private getEffectiveOKXAccountType(apiType: string): string {
    console.log(`[v0] [OKX] Mapping contract type '${apiType}' to OKX accountType`)
    
    if (apiType === "spot") {
      console.log(`[v0] [OKX] Contract Type 'spot' → OKX accountType 'TRADING'`)
      return "TRADING"
    }
    if (apiType === "perpetual_futures" || apiType === "futures") {
      console.log(`[v0] [OKX] Contract Type '${apiType}' → OKX accountType 'FUTURES'`)
      return "FUTURES"
    }
    if (apiType === "margin") {
      console.log(`[v0] [OKX] Contract Type 'margin' → OKX accountType 'MARGIN'`)
      return "MARGIN"
    }
    // Default to TRADING/SPOT for backward compatibility
    console.log(`[v0] [OKX] No match for apiType '${apiType}', defaulting to TRADING`)
    return "TRADING"
  }
}
