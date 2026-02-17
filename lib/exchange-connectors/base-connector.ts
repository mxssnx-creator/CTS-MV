/**
 * Base Exchange Connector Interface
 * All exchange connectors must implement this interface for consistency
 */

import { getRateLimiter } from "@/lib/rate-limiter"

export interface ExchangeCredentials {
  apiKey: string
  apiSecret: string
  apiPassphrase?: string
  isTestnet: boolean
  apiType?: string
  apiSubtype?: string
  marginType?: string
  positionMode?: string
  connectionMethod?: string
  connectionLibrary?: string
}

export interface ExchangeBalance {
  asset: string
  free: number
  locked: number
  total: number
}

export interface ExchangeConnectorResult {
  success: boolean
  balance: number // USDT balance
  btcPrice?: number // BTC/USDT price (optional)
  balances?: ExchangeBalance[]
  capabilities: string[]
  error?: string
  logs: string[]
}

export abstract class BaseExchangeConnector {
  protected credentials: ExchangeCredentials
  protected logs: string[] = []
  protected timeout = 10000 // 10 seconds
  protected rateLimiter: ReturnType<typeof getRateLimiter>

  constructor(credentials: ExchangeCredentials, exchange: string) {
    this.credentials = credentials
    this.rateLimiter = getRateLimiter(exchange)
  }

  protected log(message: string): void {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}`
    this.logs.push(logMessage)
    console.log(`[v0] ${logMessage}`)
  }

  protected logError(message: string): void {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ERROR: ${message}`
    this.logs.push(logMessage)
    console.error(`[v0] ${logMessage}`)
  }

  protected getEffectiveAccountType(): string {
    // CRITICAL: Contract types vs Account types are DIFFERENT concepts
    // 
    // CONTRACT TYPES (what you trade): spot, perpetual_futures, futures
    //   - Defines the trading section/market you're accessing
    //   - Independent variable that affects API endpoints and base URLs
    //   - Examples: BTC/USDT spot, BTC/USDT perpetual futures
    //
    // ACCOUNT TYPES (how exchange organizes wallets): UNIFIED, CONTRACT, SPOT
    //   - Bybit-specific parameter for wallet-level organization
    //   - UNIFIED = all contract types in one wallet
    //   - CONTRACT = derivatives/futures only wallet
    //   - SPOT = spot trading only wallet
    //
    // This method maps contract types → Bybit accountType parameter
    
    const apiType = this.credentials.apiType
    console.log(`[v0] [Connector] getEffectiveAccountType - Contract Type Input: ${apiType}`)
    
    if (apiType === "unified") {
      // Unified account can trade spot, perpetual, and derivatives in one wallet
      console.log(`[v0] [Connector] Contract Type 'unified' → Bybit accountType 'UNIFIED'`)
      return "UNIFIED"
    }
    if (apiType === "perpetual_futures" || apiType === "futures") {
      // Contract-specific wallet for derivatives/perpetual futures only
      console.log(`[v0] [Connector] Contract Type '${apiType}' → Bybit accountType 'CONTRACT'`)
      return "CONTRACT"
    }
    if (apiType === "spot") {
      // Spot-specific wallet for spot trading only
      console.log(`[v0] [Connector] Contract Type 'spot' → Bybit accountType 'SPOT'`)
      return "SPOT"
    }
    console.log(`[v0] [Connector] No match for apiType '${apiType}', defaulting to UNIFIED`)
    return "UNIFIED" // Default fallback for backward compatibility
  }

  protected getEffectiveSubType(): string | undefined {
    // Map subtype for unified accounts
    if (this.credentials.apiType === "unified" && this.credentials.apiSubtype) {
      return this.credentials.apiSubtype
    }
    return undefined
  }

  protected async rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
    return this.rateLimiter.execute(async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        return response
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    })
  }

  abstract testConnection(): Promise<ExchangeConnectorResult>
  abstract getBalance(): Promise<ExchangeConnectorResult>
  abstract getCapabilities(): string[]
}
