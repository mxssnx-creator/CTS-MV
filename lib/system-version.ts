// System version tracking - increment on each major change
export const SYSTEM_VERSION = "2026.02.26.v4"

// Component versions - track UI code changes
export const COMPONENT_VERSIONS = {
  dashboardManager: "v4", // Dashboard active connections manager
  statisticsOverview: "v3", // Statistics overview widget
  systemInitializer: "v2", // System initialization
  connectionState: "v2", // Connection state management
  globalControls: "v2", // Global trade engine controls
} as const

// API versions - track backend changes
export const API_VERSIONS = {
  connections: "v3", // Settings connections API
  tradeEngine: "v2", // Trade engine APIs
  systemStats: "v3", // System statistics
  indicationsStats: "v1", // Indications stats
  strategiesEvaluation: "v1", // Strategies evaluation
} as const

// Get current system version info
export function getSystemVersionInfo() {
  return {
    system: SYSTEM_VERSION,
    components: COMPONENT_VERSIONS,
    apis: API_VERSIONS,
    timestamp: new Date().toISOString(),
    buildTime: new Date().getTime(),
  }
}
