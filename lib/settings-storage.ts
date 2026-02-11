import fs from "fs"
import path from "path"

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "cts-data")
    : path.join(process.cwd(), "data")

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json")

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      console.log("[v0] Created settings directory:", DATA_DIR)
    }
  } catch (error) {
    console.error("[v0] Error creating settings directory:", error)
  }
}

export function loadSettings(): Record<string, any> {
  try {
    ensureDataDir()
    
    if (!fs.existsSync(SETTINGS_FILE)) {
      console.log("[v0] No settings file found, returning defaults")
      return getDefaultSettings()
    }

    const data = fs.readFileSync(SETTINGS_FILE, "utf-8")
    const settings = JSON.parse(data)
    console.log("[v0] Loaded settings from file:", Object.keys(settings).length, "keys")
    
    // Merge with defaults to ensure all required keys exist
    return { ...getDefaultSettings(), ...settings }
  } catch (error) {
    console.error("[v0] Error loading settings:", error)
    return getDefaultSettings()
  }
}

export function saveSettings(settings: Record<string, any>): void {
  try {
    ensureDataDir()
    
    const data = JSON.stringify(settings, null, 2)
    fs.writeFileSync(SETTINGS_FILE, data, "utf-8")
    console.log("[v0] Saved settings to file:", Object.keys(settings).length, "keys")
  } catch (error) {
    console.error("[v0] Error saving settings:", error)
    throw error
  }
}

export function getDefaultSettings(): Record<string, any> {
  return {
    // Engine intervals
    mainEngineIntervalMs: 60000,
    presetEngineIntervalMs: 120000,
    strategyUpdateIntervalMs: 10000,
    realtimeIntervalMs: 3000,
    
    // Engine toggles
    mainEngineEnabled: true,
    presetEngineEnabled: true,
    
    // Connection settings
    minimum_connect_interval: 200,
    
    // UI settings
    theme: "dark",
    language: "en",
    notifications_enabled: true,
    
    // Trading defaults
    default_leverage: 10,
    default_volume: 100,
    max_open_positions: 10,
    
    // Risk management
    max_drawdown_percent: 20,
    daily_loss_limit: 1000,
    
    // Symbols
    main_symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
    forced_symbols: [],
    
    // Database
    database_type: "redis",
  }
}
