import crypto from "crypto"
import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"
import { safeParseResponse } from "@/lib/safe-response-parser"

export class BingXConnector extends BaseExchangeConnector {
  private getBaseUrl(): string {
    return this.credentials.isTestnet ? "https://testnet-open-api.bingx.com" : "https://open-api.bingx.com"
  }

  getCapabilities(): string[] {
    return ["futures", "perpetual_futures", "leverage", "hedge_mode", "cross_margin"]
  }

  async testConnection(): Promise<ExchangeConnectorResult> {
    this.log("Starting BingX connection test")
    this.log(`Using endpoint: ${this.getBaseUrl()}`)
    this.log(`Environment: ${this.credentials.isTestnet ? "testnet" : "mainnet"}`)

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
      // Validate credentials first
      if (!this.credentials.apiKey || !this.credentials.apiSecret) {
        throw new Error("API key and secret are required")
      }

      // Build query parameters - only timestamp for balance query
      const params: Record<string, string> = {
        timestamp: String(timestamp),
      }

      // Sort parameters alphabetically and build query string (BingX requirement)
      const sortedKeys = Object.keys(params).sort()
      const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&')

      // Generate HMAC-SHA256 signature from the query string
      const signature = crypto
        .createHmac("sha256", this.credentials.apiSecret)
        .update(queryString)
        .digest("hex")

      this.log(`Query string: ${queryString}`)
      this.log(`API Key prefix: ${this.credentials.apiKey.substring(0, 10)}...`)
      this.log(`Signature (first 16 chars): ${signature.substring(0, 16)}...`)

      this.log("Fetching account balance...")

      // Use correct endpoint based on API type (contract type)
      // BingX has separate API paths for different contract types
      const apiType = this.credentials.apiType || "perpetual_futures"
      let endpoint = "/openApi/swap/v3/user/balance" // Default: perpetual futures
      
      console.log(`[v0] [BingX] Configured API Type: ${apiType}`)
      
      if (apiType === "spot") {
        endpoint = "/openApi/spot/v1/account/balance"
        this.log("Contract Type: SPOT → Using /openApi/spot/v1/account/balance")
        console.log("[v0] [BingX] Contract Type: SPOT → Endpoint: /openApi/spot/v1/account/balance")
      } else if (apiType === "perpetual_futures" || apiType === "futures") {
        endpoint = "/openApi/swap/v3/user/balance"
        this.log("Contract Type: PERPETUAL FUTURES → Using /openApi/swap/v3/user/balance")
        console.log("[v0] [BingX] Contract Type: PERPETUAL → Endpoint: /openApi/swap/v3/user/balance")
      }

      const url = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`
      this.log(`Full URL: ${baseUrl}${endpoint}`)

      const response = await this.rateLimitedFetch(url, {
        method: "GET",
        headers: {
          "X-BX-APIKEY": this.credentials.apiKey,
          "Content-Type": "application/json",
        },
      })

      const data = await safeParseResponse(response)

      this.log(`Response status: ${response.status}`)
      this.log(`Response code: ${data.code}`)

      // Check for error responses
      if (!response.ok || data.code !== 0) {
        const errorMsg = data.msg || data.error || `HTTP ${response.status}: ${response.statusText}`
        this.logError(`API Error (code ${data.code}): ${errorMsg}`)
        throw new Error(errorMsg)
      }

      this.log("Successfully retrieved account data")

      // Parse balance data - BingX returns data.data as the array directly
      this.log(`[Debug] Full response data: ${JSON.stringify(data).substring(0, 500)}`)
      
      // data.data IS the balance array, not data.data.balance
      const balanceData = Array.isArray(data.data) ? data.data : []
      
      if (!Array.isArray(balanceData)) {
        this.logError(`Invalid balance data format: ${JSON.stringify(balanceData).substring(0, 200)}`)
        throw new Error("Invalid balance data format from API")
      }

      this.log(`[Debug] Received ${balanceData.length} balance entries`)
      if (balanceData.length > 0) {
        this.log(`[Debug] First balance entry: ${JSON.stringify(balanceData[0]).substring(0, 300)}`)
      }

      // Extract USDT balance - BingX returns balance as a string number
      const usdtEntry = balanceData.find((b: any) => b.asset === "USDT")
      const usdtBalance = usdtEntry ? Number.parseFloat(usdtEntry.balance || "0") : 0
      
      this.log(`[Debug] USDT entry found: ${!!usdtEntry}`)
      this.log(`[Debug] USDT balance value: ${usdtBalance}`)

      // Get BTC price from market data or estimate
      let btcPrice = 0
      try {
        // Try to fetch current BTC/USDT price
        const priceResponse = await fetch("https://open-api.bingx.com/openApi/spot/v1/ticker/price?symbol=BTC-USDT")
        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          btcPrice = Number.parseFloat(priceData.data?.price || "0")
          this.log(`[Debug] BTC/USDT price fetched: $${btcPrice.toFixed(2)}`)
        }
      } catch (e) {
        this.log(`[Debug] Could not fetch BTC price: ${e}`)
      }

      // Map all balances with proper field extraction
      const balances = balanceData.map((b: any) => ({
        asset: b.asset || "UNKNOWN",
        free: Number.parseFloat(b.availableMargin || b.free || "0"),
        locked: Number.parseFloat(b.frozenMargin || b.locked || "0"),
        total: Number.parseFloat(b.balance || b.total || "0"),
      }))

      this.log(`✓ Account Balance: ${usdtBalance.toFixed(4)} USDT`)
      this.log(`✓ Total assets: ${balances.length}`)
      this.log(`✓ BTC Price: $${btcPrice.toFixed(2)}`)

      return {
        success: true,
        balance: usdtBalance,
        btcPrice: btcPrice,
        balances,
        capabilities: this.getCapabilities(),
        logs: this.logs,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Connection error: ${errorMsg}`)
      throw error
    }
  }
}
