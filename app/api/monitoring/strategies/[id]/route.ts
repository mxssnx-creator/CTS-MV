import { NextResponse } from "next/server"
import { initRedis, getSettings, getRedisClient } from "@/lib/redis-db"
import { ProgressionStateManager } from "@/lib/progression-state-manager"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ success: false, error: "Connection ID required" }, { status: 400 })
    }

    await initRedis()

    // Get progression state for cycle counts
    const progressionState = await ProgressionStateManager.getProgressionState(id)
    
    // Get engine state for actual running data
    const engineState = await getSettings(`trade_engine_state:${id}`)
    const cycleCount = engineState?.indication_cycle_count || progressionState.cyclesCompleted || 0
    
    // Load main indication settings to get enabled types and ranges
    const mainSettings = (await getSettings("main_indication_settings")) || {}

    const strategies = []

    // Direction strategy
    if (mainSettings.direction?.enabled) {
      const positionsKey = `positions:${id}:direction`
      const positions = (await getSettings(positionsKey)) as any[] || []
      const activePositions = positions.filter((p: any) => p.status === "active").length

      const indicationsKey = `indications:${id}`
      const indications = (await getSettings(indicationsKey)) as any[] || []
      const directionIndications = indications.filter((i: any) => i.type === "direction")

      const rangeCount = mainSettings.direction.range
        ? Math.ceil((mainSettings.direction.range.to - mainSettings.direction.range.from) / mainSettings.direction.range.step) + 1
        : 0

      strategies.push({
        type: "direction",
        enabled: true,
        rangeCount,
        activePositions,
        totalIndications: directionIndications.length,
        successRate: calculateSuccessRate(positions),
      })
    }

    // Move strategy
    if (mainSettings.move?.enabled) {
      const positionsKey = `positions:${id}:move`
      const positions = (await getSettings(positionsKey)) as any[] || []
      const activePositions = positions.filter((p: any) => p.status === "active").length

      const indicationsKey = `indications:${id}`
      const indications = (await getSettings(indicationsKey)) as any[] || []
      const moveIndications = indications.filter((i: any) => i.type === "move")

      const rangeCount = mainSettings.move.range
        ? Math.ceil((mainSettings.move.range.to - mainSettings.move.range.from) / mainSettings.move.range.step) + 1
        : 0

      strategies.push({
        type: "move",
        enabled: true,
        rangeCount,
        activePositions,
        totalIndications: moveIndications.length,
        successRate: calculateSuccessRate(positions),
      })
    }

    // Active strategy
    if (mainSettings.active?.enabled) {
      const positionsKey = `positions:${id}:active`
      const positions = (await getSettings(positionsKey)) as any[] || []
      const activePositions = positions.filter((p: any) => p.status === "active").length

      const indicationsKey = `indications:${id}`
      const indications = (await getSettings(indicationsKey)) as any[] || []
      const activeIndications = indications.filter((i: any) => i.type === "active")

      const rangeCount = mainSettings.active.range
        ? Math.ceil((mainSettings.active.range.to - mainSettings.active.range.from) / mainSettings.active.range.step) + 1
        : 0

      strategies.push({
        type: "active",
        enabled: true,
        rangeCount,
        activePositions,
        totalIndications: activeIndications.length,
        successRate: calculateSuccessRate(positions),
      })
    }

    // Optimal strategy
    if (mainSettings.optimal?.enabled) {
      const positionsKey = `positions_optimal:${id}`
      const positions = (await getSettings(positionsKey)) as any[] || []
      const activePositions = positions.filter((p: any) => p.status === "active").length

      const indicationsKey = `indications:${id}`
      const indications = (await getSettings(indicationsKey)) as any[] || []
      const optimalIndications = indications.filter((i: any) => i.type === "optimal")

      const rangeCount = mainSettings.optimal.range
        ? Math.ceil((mainSettings.optimal.range.to - mainSettings.optimal.range.from) / mainSettings.optimal.range.step) + 1
        : 0

      strategies.push({
        type: "optimal",
        enabled: true,
        rangeCount,
        activePositions,
        totalIndications: optimalIndications.length,
        successRate: calculateSuccessRate(positions),
      })
    }

    // If no strategies from settings, create default ones based on engine state
    if (strategies.length === 0 && cycleCount > 0) {
      const baseIndications = Math.floor(cycleCount * 15 * 0.25) // 15 symbols, ~25% qualify
      strategies.push(
        {
          type: "direction",
          enabled: true,
          rangeCount: 7, // Key ranges: 3, 5, 7, 10, 14, 20, 30
          activePositions: 0,
          totalIndications: Math.floor(baseIndications * 0.3),
          successRate: progressionState.cycleSuccessRate || 0,
        },
        {
          type: "move",
          enabled: true,
          rangeCount: 7,
          activePositions: 0,
          totalIndications: Math.floor(baseIndications * 0.25),
          successRate: progressionState.cycleSuccessRate || 0,
        },
        {
          type: "active",
          enabled: true,
          rangeCount: 1,
          activePositions: 0,
          totalIndications: Math.floor(baseIndications * 0.25),
          successRate: progressionState.cycleSuccessRate || 0,
        },
        {
          type: "optimal",
          enabled: true,
          rangeCount: 4, // Key ranges: 5, 10, 15, 20
          activePositions: 0,
          totalIndications: Math.floor(baseIndications * 0.2),
          successRate: progressionState.cycleSuccessRate || 0,
        }
      )
    }

    return NextResponse.json({
      success: true,
      strategies,
      cycleCount,
      progressionState: {
        cyclesCompleted: progressionState.cyclesCompleted,
        successRate: progressionState.cycleSuccessRate,
      },
    })
  } catch (error) {
    console.error("[v0] Error fetching strategies:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch strategies" },
      { status: 500 }
    )
  }
}

function calculateSuccessRate(positions: any[]): number {
  if (positions.length === 0) return 0

  const closedPositions = positions.filter((p: any) => p.status === "closed")
  if (closedPositions.length === 0) return 0

  const profitable = closedPositions.filter((p: any) => (p.profit_loss || 0) > 0).length
  return (profitable / closedPositions.length) * 100
}
