import { NextResponse } from "next/server"
import { initRedis, getRedisClient, getAllConnections } from "@/lib/redis-db"

// POST: Inject environment variable credentials into connections
// This updates BingX connection with BINGX_API_KEY and BINGX_API_SECRET from env
export async function POST() {
  try {
    await initRedis()
    const client = getRedisClient()
    
    // Get credentials from environment
    const bingxApiKey = process.env.BINGX_API_KEY || ""
    const bingxApiSecret = process.env.BINGX_API_SECRET || ""
    
    const results: Record<string, any> = {
      bingx: { found: false, updated: false, hasCredentials: false }
    }
    
    // Check if credentials exist
    if (bingxApiKey.length > 10 && bingxApiSecret.length > 10) {
      results.bingx.hasCredentials = true
      
      // Find BingX connection
      const connections = await getAllConnections()
      const bingxConn = connections.find((c: any) => 
        c.id === "bingx-x01" || 
        (c.exchange || "").toLowerCase() === "bingx"
      )
      
      if (bingxConn) {
        results.bingx.found = true
        results.bingx.connectionId = bingxConn.id
        
        // Update with real credentials
        await client.hset(`connection:${bingxConn.id}`, {
          api_key: bingxApiKey,
          api_secret: bingxApiSecret,
          credentials_source: "environment",
          credentials_updated_at: new Date().toISOString(),
        })
        
        results.bingx.updated = true
        console.log(`[v0] Injected BingX credentials from environment into ${bingxConn.id}`)
      }
    }
    
    return NextResponse.json({
      success: true,
      message: "Credential injection complete",
      results,
      env: {
        BINGX_API_KEY: bingxApiKey ? `${bingxApiKey.substring(0, 8)}...` : "not set",
        BINGX_API_SECRET: bingxApiSecret ? "***set***" : "not set",
      }
    })
  } catch (error) {
    console.error("[v0] Error injecting credentials:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// GET: Check current credential status
export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    
    const bingxApiKey = process.env.BINGX_API_KEY || ""
    const bingxApiSecret = process.env.BINGX_API_SECRET || ""
    
    // Get BingX connection current state
    const bingxData = await client.hgetall("connection:bingx-x01")
    const currentKey = bingxData?.api_key || ""
    const hasValidKey = currentKey.length > 10 && !currentKey.includes("placeholder")
    
    return NextResponse.json({
      environment: {
        BINGX_API_KEY: bingxApiKey ? `${bingxApiKey.substring(0, 8)}...` : "not set",
        BINGX_API_SECRET: bingxApiSecret ? "***set***" : "not set",
        hasValidEnvCredentials: bingxApiKey.length > 10 && bingxApiSecret.length > 10,
      },
      connection: {
        id: "bingx-x01",
        hasValidCredentials: hasValidKey,
        credentialsSource: bingxData?.credentials_source || "unknown",
        lastUpdated: bingxData?.credentials_updated_at || null,
      },
      needsInjection: (bingxApiKey.length > 10) && !hasValidKey,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
