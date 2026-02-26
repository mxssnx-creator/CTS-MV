import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * GET /api/dashboard/system-stats-v2
 * Proxy to v3 -- v2 and v3 had identical logic. Single source of truth is v3.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const v3Url = `${url.origin}/api/dashboard/system-stats-v3`
    const res = await fetch(v3Url, { cache: "no-store" })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to proxy to system-stats-v3" },
      { status: 500 }
    )
  }
}
