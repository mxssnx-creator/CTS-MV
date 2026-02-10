import { NextResponse } from "next/server"
import { initRedis, getSettings, setSettings } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

export const runtime = "nodejs"

// Default settings structure
const DEFAULT_SETTINGS = {
  base_volume_factor: 1.0,
  positions_average: 3,
  max_leverage: 20,
  negativeChangePercent: 5,
  leveragePercentage: 80,
  prehistoricDataDays: 30,
  marketTimeframe: 5,
  tradeIntervalSeconds: 60,
  realPositionsIntervalSeconds: 30,
  validationTimeoutSeconds: 10,
  mainTradeInterval: 60000,
  presetTradeInterval: 120000,
  positionCost: 10,
  useMaximalLeverage: false,
  baseValueRangeMin: 0.5,
  baseValueRangeMax: 2.0,
  baseRatioMin: 0.1,
  baseRatioMax: 0.9,
  trailingOption: false,
  previousPositionsCount: 10,
  lastStateCount: 5,
  trailingEnabled: false,
  trailingStartValues: "5,10,15",
  trailingStopValues: "2,5,8",
  blockAdjustment: true,
  dcaAdjustment: true,
  arrangementType: "balanced",
  numberOfSymbolsToSelect: 10,
  quoteAsset: "USDT",
  baseProfitFactor: 1.5,
  mainProfitFactor: 2.0,
  realProfitFactor: 1.2,
  trailingStopLoss: false,
  maxDrawdownTimeHours: 24,
  mainEngineIntervalMs: 60000,
  presetEngineIntervalMs: 120000,
  activeOrderHandlingIntervalMs: 10000,
  databaseSizeBase: 1000,
  databaseSizeMain: 5000,
  databaseSizeReal: 500,
  databaseSizePreset: 2000,
  positionCooldownMs: 300000,
  maxPositionsPerConfigDirection: 5,
  maxConcurrentOperations: 10,
  autoRestartOnErrors: true,
  logLevel: "info",
  maxDatabaseSizeMB: 100,
  databaseThresholdPercent: 80,
  automaticDatabaseCleanup: true,
  automaticDatabaseBackups: true,
  backupInterval: "daily",
  minimumConnectIntervalMs: 5000,
  symbolsPerExchange: 20,
  defaultMarginType: "isolated",
  defaultPositionMode: "hedge",
  rateLimitDelayMs: 100,
  maxConcurrentConnections: 5,
  enableTestnetByDefault: false,
  logsLevel: "info",
  logsCategory: "all",
  logsLimit: 1000,
  enableSystemMonitoring: true,
  metricsRetentionDays: 30,
  mainEngineEnabled: true,
  presetEngineEnabled: true,
  useMainSymbols: false,
  symbolOrderType: "volume",
  indication_time_interval: 300,
  indication_range_min: 1.0,
  indication_range_max: 3.0,
  indication_min_profit_factor: 1.1,
  strategy_time_interval: 600,
  strategy_min_profit_factor: 1.2,
  stepRelationMinRatio: 0.5,
  stepRelationMaxRatio: 2.0,
  block_enabled: true,
  dca_enabled: true,
  marketActivityEnabled: true,
  marketActivityCalculationRange: 100,
  marketActivityPositionCostRatio: 0.5,
  directionEnabled: true,
  directionInterval: 60000,
  directionTimeout: 300000,
  directionRangeFrom: -10,
  directionRangeTo: 10,
  moveEnabled: true,
  moveInterval: 60000,
  moveTimeout: 300000,
  activeEnabled: true,
  activeInterval: 30000,
  activeTimeout: 120000,
  optimalCoordinationEnabled: true,
  trailingOptimalRanges: false,
  simultaneousTrading: true,
  positionIncrementAfterSituation: true,
  rsiEnabled: true,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  macdEnabled: true,
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalPeriod: 9,
  bollingerEnabled: true,
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  emaEnabled: true,
  emaShortPeriod: 12,
  emaLongPeriod: 26,
  smaEnabled: true,
  smaShortPeriod: 50,
  smaLongPeriod: 200,
  stochasticEnabled: true,
  stochasticKPeriod: 14,
  stochasticDPeriod: 3,
  atrEnabled: true,
  atrPeriod: 14,
  trading_enabled: false,
}

export async function GET() {
  try {
    console.log("[v0] GET /api/settings - Loading settings from Redis...")
    await SystemLogger.logAPI("Loading system settings from Redis", "info", "GET /api/settings")

    await initRedis()
    
    // Try to load all settings as a single object
    const storedSettings = await getSettings("all_settings")
    
    if (storedSettings && typeof storedSettings === "object") {
      console.log("[v0] Settings loaded successfully from Redis")
      return NextResponse.json({ settings: { ...DEFAULT_SETTINGS, ...storedSettings } })
    }

    console.log("[v0] No settings found in Redis, returning defaults")
    return NextResponse.json({ settings: DEFAULT_SETTINGS })
  } catch (error) {
    console.error("[v0] Failed to get settings from Redis:", error)
    await SystemLogger.logError(error, "api", "GET /api/settings")

    return NextResponse.json({ settings: DEFAULT_SETTINGS })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    console.log("[v0] Saving settings to Redis:", Object.keys(body).length, "keys")
    await SystemLogger.logAPI(`Saving ${Object.keys(body).length} settings to Redis`, "info", "POST /api/settings")

    await initRedis()

    // Save all settings as a single object
    await setSettings("all_settings", body)

    console.log("[v0] Settings saved successfully to Redis")
    await SystemLogger.logAPI("Settings saved successfully to Redis", "info", "POST /api/settings")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to update settings in Redis:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings")

    return NextResponse.json(
      { error: "Failed to update settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
