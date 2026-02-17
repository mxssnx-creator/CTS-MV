/**
 * ConnectionManager v2
 * Modern connection management with Redis storage, proper state validation, error handling, and UI updates
 */

import { initRedis, getAllConnections, getConnection, updateConnection, type Connection } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

export type ConnectionStatus = "active" | "inactive" | "error" | "testing"

export interface ConnectionState {
  id: string
  name: string
  exchange: string
  status: ConnectionStatus
  enabled: boolean
  testPassed: boolean
  lastTestTime?: Date
  lastError?: string
  credentialsConfigured: boolean
}

/**
 * ConnectionManager - Singleton pattern for managing exchange connections using Redis
 * Provides state validation, error handling, and coordinated updates
 */
export class ConnectionManager {
  private static instance: ConnectionManager
  private connections: Map<string, ConnectionState> = new Map()
  private listeners: Set<(connections: ConnectionState[]) => void> = new Set()
  private initialized = false

  private constructor() {}

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager()
    }
    return ConnectionManager.instance
  }

  /**
   * Initialize and load connections from Redis
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      await initRedis()
      const connections = await getAllConnections()

      this.connections.clear()

      for (const conn of connections) {
        this.connections.set(conn.id, {
          id: conn.id,
          name: conn.name,
          exchange: conn.exchange,
          status: conn.is_enabled ? "active" : "inactive",
          enabled: conn.is_enabled === "1" || conn.is_enabled === true,
          testPassed: conn.last_test_status === "success",
          lastTestTime: conn.last_test_at ? new Date(conn.last_test_at) : undefined,
          lastError: undefined,
          credentialsConfigured: !!(conn.api_key && conn.api_secret),
        })
      }

      this.initialized = true
      this.notifyListeners()
    } catch (error) {
      console.error("[v0] Failed to initialize ConnectionManager:", error)
      await SystemLogger.logError(error, "connection-manager", "initialize")
    }
  }

  /**
   * Get all connections as ConnectionState array
   */
  getConnections(): ConnectionState[] {
    return Array.from(this.connections.values())
  }

  /**
   * Get a specific connection
   */
  getConnection(id: string): ConnectionState | undefined {
    return this.connections.get(id)
  }

  /**
   * Update a connection state in both memory and Redis
   */
  async updateConnection(id: string, updates: Partial<ConnectionState>): Promise<void> {
    try {
      await initRedis()
      const connection = await getConnection(id)

      if (!connection) {
        throw new Error(`Connection not found: ${id}`)
      }

      // Update Redis
      const updatedConnection: any = {
        ...connection,
        is_enabled: updates.enabled ? "1" : "0",
        updated_at: new Date().toISOString(),
      }

      await updateConnection(id, updatedConnection)

      // Update memory
      const state = this.connections.get(id)
      if (state) {
        Object.assign(state, updates)
        this.notifyListeners()
      }

      console.log("[v0] Connection updated:", id)
    } catch (error) {
      console.error("[v0] Failed to update connection:", error)
      await SystemLogger.logError(error, "connection-manager", `updateConnection(${id})`)
    }
  }

  /**
   * Subscribe to connection changes
   */
  subscribe(listener: (connections: ConnectionState[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    const connections = this.getConnections()
    for (const listener of this.listeners) {
      listener(connections)
    }
  }
}

   * Get connection by ID
   */
  getConnection(id: string): ConnectionState | undefined {
    return this.connections.get(id)
  }

  /**
   * Update connection enabled status with validation
   */
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    try {
      const connections = loadConnections()
      if (!Array.isArray(connections)) throw new Error("Invalid connections data")

      const index = connections.findIndex((c) => c.id === id)
      if (index === -1) throw new Error("Connection not found")

      const connection = connections[index]

      // Validation: Check if credentials are configured
      if (enabled && !connection.api_key) {
        throw new Error("Cannot enable connection without configured credentials")
      }

      connections[index] = {
        ...connection,
        is_enabled: enabled,
        updated_at: new Date().toISOString(),
      }

      saveConnections(connections)

      // Update local state
      const state = this.connections.get(id)
      if (state) {
        state.enabled = enabled
        state.status = enabled ? "active" : "inactive"
        this.notifyListeners()
      }

      await SystemLogger.logConnection(`Connection ${enabled ? "enabled" : "disabled"}`, id, "info")
    } catch (error) {
      console.error("[v0] Failed to set enabled:", error)
      throw error
    }
  }

  /**
   * Update connection settings (API key, secret, etc)
   */
  async updateSettings(id: string, settings: Partial<Connection>): Promise<void> {
    try {
      const connections = loadConnections()
      if (!Array.isArray(connections)) throw new Error("Invalid connections data")

      const index = connections.findIndex((c) => c.id === id)
      if (index === -1) throw new Error("Connection not found")

      connections[index] = {
        ...connections[index],
        ...settings,
        id: connections[index].id, // Preserve ID
        created_at: connections[index].created_at, // Preserve creation time
        updated_at: new Date().toISOString(),
      }

      saveConnections(connections)

      // Update local state
      const state = this.connections.get(id)
      if (state) {
        state.credentialsConfigured = !!(settings.api_key && !settings.api_key.includes("PLACEHOLDER"))
        this.notifyListeners()
      }

      await SystemLogger.logConnection(`Connection settings updated`, id, "info")
    } catch (error) {
      console.error("[v0] Failed to update settings:", error)
      throw error
    }
  }

  /**
   * Mark test as passed
   */
  async markTestPassed(id: string, balance?: number): Promise<void> {
    try {
      const connections = loadConnections()
      if (!Array.isArray(connections)) throw new Error("Invalid connections data")

      const index = connections.findIndex((c) => c.id === id)
      if (index === -1) throw new Error("Connection not found")

      connections[index] = {
        ...connections[index],
        last_test_status: "success",
        last_test_balance: balance,
        last_test_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      saveConnections(connections)

      // Update local state
      const state = this.connections.get(id)
      if (state) {
        state.testPassed = true
        state.lastTestTime = new Date()
        state.lastError = undefined
        this.notifyListeners()
      }

      await SystemLogger.logConnection(`Connection test passed`, id, "info")
    } catch (error) {
      console.error("[v0] Failed to mark test passed:", error)
      throw error
    }
  }

  /**
   * Mark test as failed
   */
  async markTestFailed(id: string, error: string): Promise<void> {
    try {
      const connections = loadConnections()
      if (!Array.isArray(connections)) throw new Error("Invalid connections data")

      const index = connections.findIndex((c) => c.id === id)
      if (index === -1) throw new Error("Connection not found")

      connections[index] = {
        ...connections[index],
        last_test_status: "failed",
        last_test_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      saveConnections(connections)

      // Update local state
      const state = this.connections.get(id)
      if (state) {
        state.testPassed = false
        state.lastTestTime = new Date()
        state.lastError = error
        this.notifyListeners()
      }

      await SystemLogger.logConnection(`Connection test failed: ${error}`, id, "error")
    } catch (error) {
      console.error("[v0] Failed to mark test failed:", error)
      throw error
    }
  }

  /**
   * Subscribe to connection changes
   */
  subscribe(listener: (connections: ConnectionState[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    const connections = Array.from(this.connections.values())
    this.listeners.forEach((listener) => listener(connections))
  }

  /**
   * Refresh connection state from file storage
   */
  refresh(): void {
    this.loadConnections()
    this.notifyListeners()
  }
}

export const getConnectionManager = () => ConnectionManager.getInstance()
