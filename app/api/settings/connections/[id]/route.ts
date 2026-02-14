import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { getConnection, updateConnection, deleteConnection, initRedis } from "@/lib/redis-db"
import { ConnectionDataArchive } from "@/lib/connection-data-archive"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    
    console.log("[v0] Fetching connection from Redis:", id)
    await initRedis()
    
    const connection = await getConnection(id)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    return NextResponse.json(connection, { status: 200 })
  } catch (error) {
    console.error("[v0] Failed to fetch connection:", error)
    await SystemLogger.logError(error, "api", `GET /api/settings/connections/${(await params).id}`)
    return NextResponse.json(
      { error: "Failed to fetch connection", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    console.log("[v0] Deleting connection from Redis:", id)
    await SystemLogger.logConnection(`Deleting connection`, id, "info")

    await initRedis()
    
    // Archive connection data before deletion so it can be restored if re-added
    console.log(`[v0] Archiving data for connection ${id}...`)
    await ConnectionDataArchive.archiveConnectionData(id)
    
    await deleteConnection(id)
    
    await SystemLogger.logConnection(`Connection deleted`, id, "info")

    return NextResponse.json({ success: true, message: "Connection deleted and data archived" })
  } catch (error) {
    console.error("[v0] Failed to delete connection:", error)
    await SystemLogger.logError(error, "api", `DELETE /api/settings/connections/${(await params).id}`)
    return NextResponse.json(
      { error: "Failed to delete connection", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    console.log("[v0] Patching connection in Redis:", id, "with", Object.keys(body).length, "fields")
    await SystemLogger.logConnection(`Patching connection`, id, "info", body)

    await initRedis()
    const connection = await getConnection(id)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const updatedConnection = {
      ...connection,
      ...body,
      id: connection.id,
      created_at: connection.created_at,
      updated_at: new Date().toISOString(),
    }

    await updateConnection(id, updatedConnection)

    console.log("[v0] Connection patched successfully:", id)
    await SystemLogger.logConnection(`Connection patched successfully`, id, "info")

    return NextResponse.json({ success: true, connection: updatedConnection })
  } catch (error) {
    console.error("[v0] Failed to patch connection:", error)
    await SystemLogger.logError(error, "api", `PATCH /api/settings/connections/${(await params).id}`)
    return NextResponse.json(
      { error: "Failed to patch connection", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}


  try {
    const { id } = await params
    const body = await request.json()

    console.log("[v0] Updating connection in Redis:", id, body)
    await SystemLogger.logConnection(`Updating connection`, id, "info", body)

    await initRedis()
    const connection = await getConnection(id)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const updatedConnection = {
      ...connection,
      ...body,
      id: connection.id,
      created_at: connection.created_at,
      updated_at: new Date().toISOString(),
    }

    await updateConnection(id, updatedConnection)

    await SystemLogger.logConnection(`Connection updated successfully`, id, "info")

    return NextResponse.json({ success: true, connection: updatedConnection })
  } catch (error) {
    console.error("[v0] Failed to update connection:", error)
    await SystemLogger.logError(error, "api", `PUT /api/settings/connections/${(await params).id}`)
    return NextResponse.json(
      { error: "Failed to update connection", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
