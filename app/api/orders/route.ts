import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getSettings, setSettings } from "@/lib/redis-db"

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    const allOrders = (await getSettings("orders")) || []
    let filtered = allOrders.filter((o: any) => o.user_id === user.id)

    if (status) {
      filtered = filtered.filter((o: any) => o.status === status)
    }

    filtered = filtered.slice(0, limit)

    return NextResponse.json({
      success: true,
      data: filtered,
    })
  } catch (error) {
    console.error("[v0] Get orders error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const { connection_id, symbol, order_type, side, price, quantity, time_in_force } = await request.json()

    if (!connection_id || !symbol || !order_type || !side || !quantity) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const existing = (await getSettings("orders")) || []
    const newOrder = {
      id: `order:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`,
      user_id: user.id,
      connection_id,
      symbol,
      order_type,
      side,
      price: price || null,
      quantity,
      remaining_quantity: quantity,
      time_in_force: time_in_force || "GTC",
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    existing.push(newOrder)
    await setSettings("orders", existing)

    return NextResponse.json({
      success: true,
      data: newOrder,
    })
  } catch (error) {
    console.error("[v0] Create order error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
