import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getConnectionPositions, createPosition } from "@/lib/redis-db"

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get("connection_id")
    const status = searchParams.get("status") || "open"

    if (!connectionId) {
      return NextResponse.json({ success: false, error: "connection_id required" }, { status: 400 })
    }

    const positions = await getConnectionPositions(connectionId)
    const filtered = status ? positions.filter((p: any) => p.status === status) : positions

    return NextResponse.json({
      success: true,
      data: filtered,
      count: filtered.length,
    })
  } catch (error) {
    console.error("[v0] Get positions error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const { connection_id, symbol, position_type, entry_price, quantity, leverage, stop_loss, take_profit } =
      await request.json()

    if (!connection_id || !symbol || !position_type || !entry_price || !quantity) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const id = await createPosition(connection_id, {
      symbol,
      position_type,
      entry_price,
      current_price: entry_price,
      quantity,
      leverage: leverage || 1.0,
      stop_loss: stop_loss || null,
      take_profit: take_profit || null,
      status: "open",
    })

    return NextResponse.json({
      success: true,
      data: { id },
    })
  } catch (error) {
    console.error("[v0] Create position error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
