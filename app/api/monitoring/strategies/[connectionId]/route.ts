import { NextResponse } from "next/server"
import { getSettings } from "@/lib/redis-db"

export async function GET(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await params

    if (!connectionId) {
      return NextResponse.json({ success: false, error: "Connection ID required" }, { status: 400 })
    }

    // Load main indication settings to get enabled types and ranges
    const mainSettings = (await getSettings("main_indication_settings")) || {}

    const strategies = []

    // Direction strategy
    if (mainSettings.direction?.enabled) {
      const positionsKey = `positions:${connectionId}:direction`
      const positions = (await getSettings(positionsKey)) as any[] || []
      const activePositions = positions.filter((p: any) => p.status === "active").length

      const indicationsKey = `indications:${connectionId}`
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
      const positionsKey = `positions:${connectionId}:move`
      const positions = (await getSettings(positionsKey)) as any[] || []
      const activePositions = positions.filter((p: any) => p.status === "active").length

      const indicationsKey = `indications:${connectionId}`
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
      const positionsKey = `positions:${connectionId}:active`
      const positions = (await getSettings(positionsKey)) as any[] || []
      const activePositions = positions.filter((p: any) => p.status === "active").length

      const indicationsKey = `indications:${connectionId}`
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
      const positionsKey = `positions_optimal:${connectionId}`
      const positions = (await getSettings(positionsKey)) as any[] || []
      const activePositions = positions.filter((p: any) => p.status === "active").length

      const indicationsKey = `indications:${connectionId}`
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

    return NextResponse.json({
      success: true,
      strategies,
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
