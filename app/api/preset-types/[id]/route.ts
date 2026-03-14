import { type NextRequest, NextResponse } from "next/server"
import DatabaseManager from "@/lib/database"
const db = DatabaseManager.getInstance()
import { EntityTypes } from "@/lib/core/entity-types"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const results = await db.query(EntityTypes.PRESET_TYPE, {
      filters: [{ field: 'id', operator: '=', value: id }]
    })
    const presetType = results[0]

    if (!presetType) {
      return NextResponse.json({ error: "Preset type not found" }, { status: 404 })
    }

    return NextResponse.json(presetType)
  } catch (error) {
    console.error("[v0] Failed to fetch preset type:", error)
    return NextResponse.json({ error: "Failed to fetch preset type" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const updates = {
      name: body.name,
      description: body.description || null,
      preset_trade_type: body.preset_trade_type || "automatic",
      max_positions_per_indication: body.max_positions_per_indication || 1,
      max_positions_per_direction: body.max_positions_per_direction || 1,
      max_positions_per_range: body.max_positions_per_range || 1,
      timeout_per_indication: body.timeout_per_indication || 5,
      timeout_after_position: body.timeout_after_position || 10,
      block_enabled: !!body.block_enabled,
      block_only: !!body.block_only,
      dca_enabled: !!body.dca_enabled,
      dca_only: !!body.dca_only,
      auto_evaluate: body.auto_evaluate !== false,
      evaluation_interval_hours: body.evaluation_interval_hours || 3,
      is_active: body.is_active !== false,
    }

    await db.update(EntityTypes.PRESET_TYPE, id, updates)

    const results = await db.query(EntityTypes.PRESET_TYPE, {
      filters: [{ field: 'id', operator: '=', value: id }]
    })
    const presetType = results[0]

    return NextResponse.json(presetType)
  } catch (error) {
    console.error("[v0] Failed to update preset type:", error)
    return NextResponse.json({ error: "Failed to update preset type" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    await db.delete(EntityTypes.PRESET_TYPE, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to delete preset type:", error)
    return NextResponse.json({ error: "Failed to delete preset type" }, { status: 500 })
  }
}
