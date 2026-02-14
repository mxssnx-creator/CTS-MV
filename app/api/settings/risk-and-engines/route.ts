import { NextRequest, NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()

    const riskSettings = await client.hgetall("settings:risk-management")
    const engineSettings = await client.hgetall("settings:engines")

    return NextResponse.json({
      success: true,
      riskManagement: {
        enabled: riskSettings.enabled === "true",
        maxOpenPositions: riskSettings.max_open_positions || "maximal",
        dailyLossLimitPercent: parseFloat(riskSettings.daily_loss_limit_percent || "65"),
        maxDrawdownPercent: parseFloat(riskSettings.max_drawdown_percent || "55"),
        positionSizeLimit: parseFloat(riskSettings.position_size_limit || "100000"),
        stopLossEnabled: riskSettings.stop_loss_enabled === "true",
        takeProfitEnabled: riskSettings.take_profit_enabled === "true",
      },
      engines: {
        presetTradeEngine: engineSettings.preset_trade_engine === "true",
        mainTradeEngine: engineSettings.main_trade_engine === "true",
        realtimePositionsEngine: engineSettings.realtime_positions_engine === "true",
        riskManagementEngine: engineSettings.risk_management_engine === "true",
      },
    })
  } catch (error) {
    console.error("[v0] Error fetching risk settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch risk settings" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    await initRedis()
    const client = getRedisClient()

    // Update risk management settings
    if (body.riskManagement) {
      const rm = body.riskManagement
      await client.hset("settings:risk-management", {
        enabled: rm.enabled ? "true" : "false",
        max_open_positions: rm.maxOpenPositions || "maximal",
        daily_loss_limit_percent: (rm.dailyLossLimitPercent || "65").toString(),
        max_drawdown_percent: (rm.maxDrawdownPercent || "55").toString(),
        position_size_limit: (rm.positionSizeLimit || "100000").toString(),
        stop_loss_enabled: rm.stopLossEnabled ? "true" : "false",
        take_profit_enabled: rm.takeProfitEnabled ? "true" : "false",
      })
    }

    // Update engine settings
    if (body.engines) {
      const eng = body.engines
      await client.hset("settings:engines", {
        preset_trade_engine: eng.presetTradeEngine ? "true" : "false",
        main_trade_engine: eng.mainTradeEngine ? "true" : "false",
        realtime_positions_engine: eng.realtimePositionsEngine ? "true" : "false",
        risk_management_engine: eng.riskManagementEngine ? "true" : "false",
      })
    }

    console.log("[v0] Risk management and engine settings updated")

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
    })
  } catch (error) {
    console.error("[v0] Error updating risk settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update risk settings" },
      { status: 500 }
    )
  }
}
