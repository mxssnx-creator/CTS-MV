/**
 * Active Connections Manager
 * Handles connections currently in use on the dashboard, separate from settings
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), ".data")
const ACTIVE_CONNECTIONS_FILE = join(DATA_DIR, "active-connections.json")

export interface ActiveConnection {
  id: string
  connectionId: string
  exchangeName: string
  isActive: boolean
  addedAt: string
}

export function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function loadActiveConnections(): ActiveConnection[] {
  try {
    ensureDataDir()

    if (existsSync(ACTIVE_CONNECTIONS_FILE)) {
      const data = readFileSync(ACTIVE_CONNECTIONS_FILE, "utf-8")
      if (data && data.trim()) {
        try {
          const connections = JSON.parse(data)
          if (Array.isArray(connections)) {
            return connections
          }
        } catch (parseError) {
          console.error("[v0] Error parsing active connections file:", parseError)
        }
      }
    }

    // Initialize with default Bybit and BingX if no file exists
    const defaults = getDefaultActiveConnections()
    saveActiveConnections(defaults)
    return defaults
  } catch (error) {
    console.error("[v0] Error loading active connections:", error)
    return getDefaultActiveConnections()
  }
}

export function saveActiveConnections(connections: ActiveConnection[]) {
  try {
    ensureDataDir()
    writeFileSync(ACTIVE_CONNECTIONS_FILE, JSON.stringify(connections, null, 2), "utf-8")
  } catch (error) {
    console.error("[v0] Error saving active connections:", error)
  }
}

export function addActiveConnection(connectionId: string, exchangeName: string): ActiveConnection {
  const connections = loadActiveConnections()
  
  // Check if already exists
  const existing = connections.find(c => c.connectionId === connectionId)
  if (existing) {
    return existing
  }

  const newConnection: ActiveConnection = {
    id: `active-${Date.now()}`,
    connectionId,
    exchangeName,
    isActive: false, // New connections disabled by default
    addedAt: new Date().toISOString(),
  }

  connections.push(newConnection)
  saveActiveConnections(connections)
  return newConnection
}

export function removeActiveConnection(connectionId: string) {
  const connections = loadActiveConnections()
  const filtered = connections.filter(c => c.connectionId !== connectionId)
  saveActiveConnections(filtered)
}

export function toggleActiveConnection(connectionId: string, isActive: boolean) {
  const connections = loadActiveConnections()
  const connection = connections.find(c => c.connectionId === connectionId)
  
  if (connection) {
    connection.isActive = isActive
    saveActiveConnections(connections)
  }
}

function getDefaultActiveConnections(): ActiveConnection[] {
  return [
    {
      id: "active-bybit",
      connectionId: "bybit-main-perpetual",
      exchangeName: "Bybit",
      isActive: true,
      addedAt: new Date().toISOString(),
    },
    {
      id: "active-bingx",
      connectionId: "bingx-main-perpetual",
      exchangeName: "BingX",
      isActive: true,
      addedAt: new Date().toISOString(),
    },
  ]
}
