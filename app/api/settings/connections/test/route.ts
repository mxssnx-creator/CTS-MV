import { NextRequest, NextResponse } from "next/server"
import { createExchangeConnector } from "@/lib/exchange-connectors"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { exchange, api_key, api_secret, api_passphrase, is_testnet, connection_method, connection_library, api_type } = body

    if (!exchange || !api_key || !api_secret) {
      return NextResponse.json(
        { success: false, log: ["Error: API Key and Secret are required"] },
        { status: 400 }
      )
    }

    const testLog: string[] = []
    testLog.push(`[${new Date().toISOString()}] Starting connection test...`)
    testLog.push(`[${new Date().toISOString()}] Exchange: ${exchange}`)
    testLog.push(`[${new Date().toISOString()}] API Type: ${api_type || "futures"}`)
    testLog.push(`[${new Date().toISOString()}] Connection Method: ${connection_method || "rest"}`)
    testLog.push(`[${new Date().toISOString()}] Connection Library: ${connection_library || "native"}`)
    testLog.push(`[${new Date().toISOString()}] Testnet: ${is_testnet ? "Yes" : "No"}`)
    testLog.push(`[${new Date().toISOString()}] ---`)

    try {
      testLog.push(`[${new Date().toISOString()}] Creating exchange connector with configured settings...`)
      const connector = await createExchangeConnector(exchange, {
        apiKey: api_key,
        apiSecret: api_secret,
        apiPassphrase: api_passphrase || "",
        isTestnet: is_testnet || false,
        connectionMethod: connection_method || "rest",
        connectionLibrary: connection_library || "native",
        apiType: api_type || "futures",
      })

      testLog.push(`[${new Date().toISOString()}] Testing connection using ${connection_method || "rest"} method with ${connection_library || "native"} library...`)
      const result = await connector.testConnection()

      if (result.success) {
        testLog.push(`[${new Date().toISOString()}] ✓ Connection successful`)
        testLog.push(`[${new Date().toISOString()}] Balance: $${result.balance?.toFixed(2) || "0.00"}`)
        testLog.push(`[${new Date().toISOString()}] Capabilities: ${result.capabilities?.join(", ") || "N/A"}`)
        
        return NextResponse.json({ 
          success: true, 
          log: testLog, 
          balance: result.balance,
          capabilities: result.capabilities 
        })
      } else {
        testLog.push(`[${new Date().toISOString()}] ✗ Connection failed`)
        testLog.push(`[${new Date().toISOString()}] Error: ${result.error || "Unknown error"}`)
        
        return NextResponse.json(
          { 
            success: false, 
            log: testLog,
            error: result.error || "Connection test failed"
          }, 
          { status: 400 }
        )
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      testLog.push(`[${new Date().toISOString()}] ✗ Error: ${errorMsg}`)
      
      return NextResponse.json(
        { 
          success: false, 
          log: testLog,
          error: errorMsg
        }, 
        { status: 500 }
      )
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Invalid request"
    return NextResponse.json(
      { 
        success: false, 
        log: [`Error: ${errorMsg}`],
        error: errorMsg
      },
      { status: 400 }
    )
  }
}
