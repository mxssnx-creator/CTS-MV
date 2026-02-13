/**
 * Connection Predefinitions
 * Pre-configured exchange connection templates for quick setup
 * Includes API types, library names, and exchange-specific options
 */

export interface ConnectionPredefinition {
  id: string
  name: string
  displayName: string
  description: string
  exchange: string
  apiTypes: string[] // Available API types for this exchange
  apiType: string // Default API type
  connectionMethod: string
  connectionLibrary: string
  libraryPackage: string // e.g., "pybit", "bingx-api", "python-okx"
  marginType: string
  positionMode: string
  maxLeverage: number
  contractType: string
  documentationUrl: string
  testnetSupported: boolean
  ccxtSupported: boolean
  apiKey?: string
  apiSecret?: string
}

export interface ExchangeConnection {
  id: string
  name: string
  exchange: string
  api_type: string
  connection_method: string
  connection_library: string
  api_key: string
  api_secret: string
  margin_type: string
  position_mode: string
  is_testnet: boolean
  is_enabled: boolean
  is_active: boolean
  is_predefined: boolean
  is_live_trade: boolean
  is_preset_trade: boolean
  last_test_status: any | null
  last_test_balance: any | null
  last_test_log: any[]
  api_capabilities: any[]
  rate_limits: any | null
  volume_factor: number
  created_at: string
  updated_at: string
}

// Exchange API Type Support (based on official documentation)
export const EXCHANGE_API_TYPES: Record<string, string[]> = {
  bybit: ["unified", "contract", "spot", "inverse"], // V5 API: Unified Trading Account, Contract, Spot, Inverse
  bingx: ["perpetual_futures", "spot", "standard"], // Standard Futures, Perpetual Swap, Spot
  binance: ["spot", "perpetual_futures", "futures", "margin", "portfolio"], // Spot, USD-M Futures, COIN-M Futures, Margin, Portfolio Margin
  okx: ["unified", "spot", "perpetual", "futures", "swap"], // Unified Account, Spot, Perpetual Swap, Futures, Options
  gateio: ["spot", "perpetual", "margin", "futures"], // Spot, Perpetual Swap, Margin, Delivery Futures
  kucoin: ["spot", "perpetual", "margin", "futures"], // Spot, Perpetual Futures, Margin, Delivery Futures
  mexc: ["spot", "perpetual"], // Spot, Perpetual Swap
  bitget: ["spot", "perpetual", "margin", "usdt_futures"], // Spot, USDT Futures, USDC Futures, Coin Futures
  pionex: ["spot", "perpetual"], // Spot, Perpetual
  orangex: ["spot", "perpetual"], // Spot, Perpetual Futures
  huobi: ["spot", "perpetual", "margin", "futures"], // Spot, Linear Swap, Inverse Swap, Margin
  kraken: ["spot", "futures"], // Spot, Futures
  coinbase: ["spot", "advanced"], // Spot, Advanced Trade API
}

export const EXCHANGE_LIBRARY_PACKAGES: Record<string, string> = {
  bybit: "pybit",
  bingx: "bingx-api",
  binance: "python-binance",
  okx: "python-okx",
  gateio: "gateapi",
  kucoin: "kucoin-python",
  mexc: "mexc-api",
  bitget: "bitget-api",
  pionex: "pionex-api",
  orangex: "orangex-api",
  huobi: "huobi-api",
  kraken: "kraken-python",
  coinbase: "coinbase-advanced-py",
}

// Connection Methods
export const CONNECTION_METHODS = {
  rest: { label: "REST API", description: "Standard HTTP REST API connection" },
  library: { label: "Library SDK", description: "Official Exchange Library SDK" },
  websocket: { label: "WebSocket", description: "Real-time WebSocket connection" },
  hybrid: { label: "Hybrid", description: "Combined REST + WebSocket for optimal performance" },
}

// API Subtypes/Trading Types
export const API_SUBTYPES = {
  spot: { label: "Spot", description: "Buy/sell cryptocurrencies directly", icon: "🏪" },
  perpetual: { label: "Perpetual", description: "Perpetual futures contracts", icon: "♾️" },
  futures: { label: "Futures", description: "Time-limited futures contracts", icon: "📅" },
  margin: { label: "Margin", description: "Margin trading with leverage", icon: "📈" },
  derivatives: { label: "Derivatives", description: "General derivatives trading", icon: "📊" },
}

// Exchange subtype support
export const EXCHANGE_SUBTYPES: Record<string, string[]> = {
  bybit: ["spot", "perpetual", "derivatives"],
  bingx: ["spot", "perpetual"],
  binance: ["spot", "perpetual", "futures", "margin"],
  okx: ["spot", "perpetual", "futures", "margin"],
  gateio: ["spot", "perpetual", "margin"],
  kucoin: ["spot", "perpetual", "margin"],
  mexc: ["spot", "perpetual"],
  bitget: ["spot", "perpetual", "margin"],
  pionex: ["spot", "perpetual"],
  orangex: ["spot", "perpetual"],
  huobi: ["spot", "perpetual", "margin"],
  kraken: ["spot", "futures"],
  coinbase: ["spot"],
}

// Exchange connection method support
export const EXCHANGE_CONNECTION_METHODS: Record<string, string[]> = {
  bybit: ["rest", "library", "websocket", "hybrid"],
  bingx: ["rest", "library", "websocket"],
  binance: ["rest", "library", "websocket", "hybrid"],
  okx: ["rest", "library", "websocket", "hybrid"],
  gateio: ["rest", "library", "websocket"],
  kucoin: ["rest", "library", "websocket"],
  mexc: ["rest", "library", "websocket"],
  bitget: ["rest", "library", "websocket"],
  pionex: ["rest", "library", "websocket"],
  orangex: ["rest", "library"],
  huobi: ["rest", "library", "websocket"],
  kraken: ["rest", "library", "websocket"],
  coinbase: ["rest", "library"],
}

export const CONNECTION_PREDEFINITIONS: ConnectionPredefinition[] = [
  {
    id: "bybit-x03",
    name: "Bybit X03",
    displayName: "Bybit X03 (Unified Trading)",
    description: "Bybit Unified Trading Account with up to 125x leverage",
    exchange: "bybit",
    apiTypes: ["unified", "contract", "spot"],
    apiType: "unified",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "pybit",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 125,
    contractType: "usdt-perpetual",
    documentationUrl: "https://bybit-exchange.github.io/docs/v5/intro",
    testnetSupported: true,
    ccxtSupported: true,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "bingx-x01",
    name: "BingX X01",
    displayName: "BingX X01 (Perpetual Futures)",
    description: "BingX USDT Perpetual Futures with up to 150x leverage",
    exchange: "bingx",
    apiTypes: ["perpetual_futures", "spot"],
    apiType: "perpetual_futures",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "bingx-api",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 150,
    contractType: "usdt-perpetual",
    documentationUrl: "https://bingx-api.github.io/docs/#/en-us/swapV2/introduce",
    testnetSupported: false,
    ccxtSupported: true,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "binance-x01",
    name: "Binance X01",
    displayName: "Binance X01 (USDⓈ-M Futures)",
    description: "Binance USDT-margined perpetual futures with up to 125x leverage",
    exchange: "binance",
    apiTypes: ["perpetual_futures", "spot", "margin"],
    apiType: "perpetual_futures",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "python-binance",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 125,
    contractType: "usdt-perpetual",
    documentationUrl: "https://binance-docs.github.io/apidocs/futures/en/",
    testnetSupported: true,
    ccxtSupported: true,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "okx-x01",
    name: "OKX X01",
    displayName: "OKX X01 (Perpetual Swap)",
    description: "OKX USDT perpetual swap contracts with up to 125x leverage",
    exchange: "okx",
    apiTypes: ["unified", "perpetual_futures", "spot"],
    apiType: "unified",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "python-okx",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 125,
    contractType: "usdt-perpetual",
    documentationUrl: "https://www.okx.com/docs-v5/en/",
    testnetSupported: true,
    ccxtSupported: true,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "gateio-x01",
    name: "Gate.io X01",
    displayName: "Gate.io X01 (Perpetual Futures)",
    description: "Gate.io USDT perpetual contracts with up to 100x leverage",
    exchange: "gateio",
    apiTypes: ["perpetual_futures", "spot", "margin"],
    apiType: "perpetual_futures",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "gateapi",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 100,
    contractType: "usdt-perpetual",
    documentationUrl: "https://www.gate.io/docs/developers/apiv4/",
    testnetSupported: true,
    ccxtSupported: true,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "kucoin-x01",
    name: "KuCoin X01",
    displayName: "KuCoin X01 (Perpetual Futures)",
    description: "KuCoin USDT perpetual contracts with up to 100x leverage",
    exchange: "kucoin",
    apiTypes: ["perpetual_futures", "spot", "margin"],
    apiType: "perpetual_futures",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "kucoin-python",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 100,
    contractType: "usdt-perpetual",
    documentationUrl: "https://www.kucoin.com/docs/rest/futures-trading/introduction",
    testnetSupported: true,
    ccxtSupported: true,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "mexc-x01",
    name: "MEXC X01",
    displayName: "MEXC X01 (Perpetual Futures)",
    description: "MEXC USDT perpetual futures with up to 200x leverage",
    exchange: "mexc",
    apiTypes: ["perpetual_futures", "spot"],
    apiType: "perpetual_futures",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "mexc-api",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 200,
    contractType: "usdt-perpetual",
    documentationUrl: "https://mexcdevelop.github.io/apidocs/contract_v1_en/",
    testnetSupported: false,
    ccxtSupported: true,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "bitget-x01",
    name: "Bitget X01",
    displayName: "Bitget X01 (Perpetual Futures)",
    description: "Bitget USDT perpetual futures with up to 125x leverage",
    exchange: "bitget",
    apiTypes: ["perpetual_futures", "spot", "margin"],
    apiType: "perpetual_futures",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "bitget-api",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 125,
    contractType: "usdt-perpetual",
    documentationUrl: "https://www.bitget.com/api-doc/contract/intro",
    testnetSupported: false,
    ccxtSupported: true,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "pionex-x01",
    name: "Pionex X01",
    displayName: "Pionex X01 (Perpetual Futures)",
    description: "Pionex USDT Perpetual Futures with up to 100x leverage",
    exchange: "pionex",
    apiTypes: ["perpetual_futures", "spot"],
    apiType: "perpetual_futures",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "pionex-api",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 100,
    contractType: "usdt-perpetual",
    documentationUrl: "https://pionex-doc.gitbook.io/apidocs/",
    testnetSupported: false,
    ccxtSupported: false,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "orangex-x01",
    name: "OrangeX X01",
    displayName: "OrangeX X01 (Perpetual Futures)",
    description: "OrangeX USDT Perpetual Futures trading",
    exchange: "orangex",
    apiTypes: ["perpetual_futures", "spot"],
    apiType: "perpetual_futures",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "orangex-api",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 125,
    contractType: "usdt-perpetual",
    documentationUrl: "https://openapi-docs.orangex.com/",
    testnetSupported: false,
    ccxtSupported: false,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
  {
    id: "huobi-x01",
    name: "Huobi X01",
    displayName: "Huobi X01 (Perpetual Swaps)",
    description: "Huobi USDT linear swaps with up to 125x leverage",
    exchange: "huobi",
    apiTypes: ["perpetual_futures", "spot", "margin"],
    apiType: "perpetual_futures",
    connectionMethod: "library",
    connectionLibrary: "native",
    libraryPackage: "huobi-api",
    marginType: "cross",
    positionMode: "hedge",
    maxLeverage: 125,
    contractType: "usdt-perpetual",
    documentationUrl: "https://www.htx.com/en-us/opend/newApiPages/",
    testnetSupported: false,
    ccxtSupported: true,
    apiKey: "00998877009988770099887700998877",
    apiSecret: "00998877009988770099887700998877",
  },
]

/**
 * Get predefined connections as static data
 * This is used by API routes to provide template options without requiring client-side imports
 */
export function getPredefinedConnectionsAsStatic(): ConnectionPredefinition[] {
  return CONNECTION_PREDEFINITIONS
}

/**
 * Convert predefined connections to ExchangeConnection format with defaults
 */
export function getPredefinedAsExchangeConnections(): ExchangeConnection[] {
  // Default enabled exchanges - Bybit, BingX, Pionex, OrangeX
  const defaultEnabled = ["bybit", "bingx", "pionex", "orangex"]
  
  console.log("[v0] Creating predefined connections with defaults:", defaultEnabled)
  
  return CONNECTION_PREDEFINITIONS.map(pred => ({
    id: pred.id,
    name: pred.name,
    exchange: pred.exchange,
    api_type: pred.apiType,
    connection_method: pred.connectionMethod,
    connection_library: pred.connectionLibrary,
    api_key: pred.apiKey || "",
    api_secret: pred.apiSecret || "",
    margin_type: pred.marginType,
    position_mode: pred.positionMode,
    is_testnet: false,
    is_enabled: defaultEnabled.includes(pred.exchange.toLowerCase()),
    is_active: defaultEnabled.includes(pred.exchange.toLowerCase()), // Active if enabled
    is_predefined: true,
    is_live_trade: false,
    is_preset_trade: false,
    last_test_status: null,
    last_test_balance: null,
    last_test_log: [],
    api_capabilities: [],
    rate_limits: null,
    volume_factor: 1.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
}
