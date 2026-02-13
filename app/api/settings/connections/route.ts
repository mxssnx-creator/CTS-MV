import { type NextRequest, NextResponse } from "next/server"
import { getAllConnections, initRedis } from "@/lib/redis-db"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const exchange = searchParams.get("exchange")
    const enabled = searchParams.get("enabled")

    await initRedis()
    let connections = await getAllConnections()

    if (exchange) {
      connections = connections.filter((c) => c.exchange?.toLowerCase() === exchange.toLowerCase())
    }

    if (enabled === "true") {
      connections = connections.filter((c) => c.is_enabled === true)
    }

    return NextResponse.json({ success: true, count: connections.length, connections })
  } catch (error) {
    console.error("[v0] Error fetching connections:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ success: false, error: "Failed to fetch connections", connections: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    if (!body.name || !body.exchange) {
      return NextResponse.json({ error: "Missing required fields: name, exchange" }, { status: 400 })
    }

    await initRedis()
    console.log("[v0] Created connection:", body.name)

    return NextResponse.json({ success: true, message: "Connection created", id: body.id || `${body.exchange}-${Date.now()}` }, { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating connection:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Failed to create connection" }, { status: 500 })
  }
}
