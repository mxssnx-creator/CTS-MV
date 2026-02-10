import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getConnectionPositions } from "@/lib/redis-db"

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
    const filtered = status ? positions.filter((p) => p.status === status) : positions

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

      JOIN portfolios pf ON p.portfolio_id = pf.id
      WHERE pf.user_id = $1 AND p.status = $2
    `
    const params: any[] = [user.id, status]

    if (portfolioId) {
      queryText += " AND p.portfolio_id = $3"
      params.push(portfolioId)
    }

    queryText += " ORDER BY p.opened_at DESC"

    const positions = await query(queryText, params)

    return NextResponse.json({
      success: true,
      data: positions,
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

    const { portfolio_id, trading_pair_id, position_type, entry_price, quantity, leverage, stop_loss, take_profit } =
      await request.json()

    // Validate required fields
    if (!portfolio_id || !trading_pair_id || !position_type || !entry_price || !quantity) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    // Verify portfolio belongs to user
    const portfolios = await query("SELECT id FROM portfolios WHERE id = ? AND user_id = ?", [portfolio_id, user.id])

    if (portfolios.length === 0) {
      return NextResponse.json({ success: false, error: "Portfolio not found" }, { status: 404 })
    }

    const result = await insertReturning(
      `INSERT INTO positions (
        portfolio_id, trading_pair_id, position_type, entry_price, current_price,
        quantity, leverage, stop_loss, take_profit, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [
        portfolio_id,
        trading_pair_id,
        position_type,
        entry_price,
        entry_price,
        quantity,
        leverage || 1.0,
        stop_loss || null,
        take_profit || null,
        "open",
      ]
    )

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error("[v0] Create position error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
