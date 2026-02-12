import { createConnection, getAllConnections, getConnection, initRedis } from "@/lib/redis-db"
import { generateConnectionIdFromApiKey } from "@/lib/connection-id-manager"

/**
 * Seeds default disabled exchanges (Bybit and BingX)
 * These are pre-configured connections that users can enable
 */
export async function seedDefaultExchanges() {
  console.log("[v0] Seeding default exchanges...")
  await initRedis()

  const defaultExchanges = [
    {
      exchange: "bybit",
      name: "Bybit (Demo)",
      description: "Bybit futures trading platform - Disabled by default",
    },
    {
      exchange: "bingx",
      name: "BingX (Demo)",
      description: "BingX perpetual futures platform - Disabled by default",
    },
  ]

  try {
    for (const exch of defaultExchanges) {
      // Generate a deterministic ID based on exchange name
      const connectionId = `${exch.exchange}-default-seed`

      // Check if already exists
      const existing = await getConnection(connectionId)
      if (existing) {
        console.log(`[v0] Default exchange ${exch.exchange} already seeded, skipping`)
        continue
      }

      // Create default disabled connection
      const defaultConnection = {
        id: connectionId,
        user_id: 1,
        name: exch.name,
        exchange: exch.exchange,
        exchange_id: exch.exchange.toUpperCase(),
        api_type: "perpetual_futures",
        api_subtype: "perpetual",
        connection_method: "rest",
        connection_library: "native",
        api_key: "", // Empty by default
        api_secret: "", // Empty by default
        api_passphrase: "",
        margin_type: "cross",
        position_mode: "hedge",
        is_testnet: true,
        is_enabled: false, // DISABLED BY DEFAULT
        is_live_trade: false,
        is_preset_trade: false,
        is_active: false, // INACTIVE BY DEFAULT
        is_predefined: true, // Mark as predefined
        volume_factor: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_test_status: "not_tested",
        last_test_log: [],
        connection_settings: {
          description: exch.description,
          baseVolumeFactorLive: 1.0,
          baseVolumeFactorPreset: 1.0,
          profitFactorMinBase: 0.6,
          profitFactorMinMain: 0.6,
          profitFactorMinReal: 0.6,
          trailingWithTrailing: true,
          trailingOnly: false,
          blockEnabled: true,
          blockOnly: false,
          dcaEnabled: false,
          dcaOnly: false,
        },
      }

      await createConnection(defaultConnection)
      console.log(`[v0] Seeded default exchange: ${exch.exchange} (disabled)`)
    }

    console.log("[v0] Default exchanges seeding completed")
    return { success: true, message: "Default exchanges seeded successfully" }
  } catch (error) {
    console.error("[v0] Error seeding default exchanges:", error)
    return { success: false, error: String(error) }
  }
}

/**
 * Ensures default exchanges exist, creating them if needed
 */
export async function ensureDefaultExchangesExist() {
  console.log("[v0] Ensuring default exchanges exist...")
  await initRedis()

  try {
    const allConnections = await getAllConnections()
    const defaultExchangeNames = ["bybit-default-seed", "bingx-default-seed"]

    const hasDefaults = defaultExchangeNames.some((name) =>
      allConnections?.some((c) => c.id === name),
    )

    if (!hasDefaults) {
      await seedDefaultExchanges()
    }

    console.log("[v0] Default exchanges check completed")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error ensuring default exchanges:", error)
    return { success: false, error: String(error) }
  }
}
