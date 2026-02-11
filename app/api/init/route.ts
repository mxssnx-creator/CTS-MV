import { NextResponse } from "next/server"
import { initializeTradeEngineAutoStart } from "@/lib/trade-engine-auto-start"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { seedDefaultPresetTypes } from "@/lib/preset-types-seed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/init
 * Initialize trade engine and system services on startup
 */
export async function GET() {
  try {
    console.log("[v0] [Init] Initializing systems...")
    
    // Seed default preset types
    await seedDefaultPresetTypes()
    
    // Ensure global coordinator is initialized
    const coordinator = getGlobalTradeEngineCoordinator()
    console.log("[v0] [Init] Global trade engine coordinator ensured")
    
    // Start auto-initialization of trade engines
    await initializeTradeEngineAutoStart()
    
    console.log("[v0] [Init] All systems initialized successfully")
    
    return NextResponse.json({ 
      success: true, 
      message: "System initialization complete",
      coordinator: "ready",
      presets: "seeded"
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] [Init] Failed to initialize:", errorMsg)
    
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    )
  }
}
