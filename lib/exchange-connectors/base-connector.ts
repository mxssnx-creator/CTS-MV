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
    // Map API/contract types to account type (exchange-specific implementation)
    const apiType = this.credentials.apiType
    console.log(`[v0] [Connector] getEffectiveAccountType called with apiType: ${apiType}`)
    
    if (apiType === "unified") {
      return "UNIFIED"
    }
    if (apiType === "perpetual_futures" || apiType === "futures") {
      return "CONTRACT"
    }
    if (apiType === "spot") {
      return "SPOT"
    }
    console.log(`[v0] [Connector] No match for apiType '${apiType}', using default UNIFIED`)
    return "UNIFIED" // Default fallback
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
