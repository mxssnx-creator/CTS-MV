"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { ExchangeConnection } from "@/lib/types"

interface ConnectionState {
  // Base connections (all connections from database) - used in Settings
  baseConnections: ExchangeConnection[]
  setBaseConnections: (connections: ExchangeConnection[]) => void
  loadBaseConnections: () => Promise<void>
  isBaseLoading: boolean
  
  // ExchangeConnectionsActive (enabled only) - used in Dashboard with independent status
  exchangeConnectionsActive: ExchangeConnection[]
  setExchangeConnectionsActive: (connections: ExchangeConnection[]) => void
  loadExchangeConnectionsActive: () => Promise<void>
  isExchangeConnectionsActiveLoading: boolean
  
  // ExchangeConnectionsActive status management - independent from settings
  exchangeConnectionsActiveStatus: Map<string, boolean> // id -> is_active
  toggleExchangeConnectionsActiveStatus: (id: string) => void
  
  // Recently inserted connections for tracking
  recentlyInsertedBase: Set<string>
  recentlyInsertedActive: Set<string>
  markAsInserted: (id: string, type: "base" | "active") => void
  clearInserted: (id: string, type: "base" | "active") => void
}

const ConnectionStateContext = createContext<ConnectionState | undefined>(undefined)

export function ConnectionStateProvider({ children }: { children: ReactNode }) {
  // Base connections state (Settings)
  const [baseConnections, setBaseConnections] = useState<ExchangeConnection[]>([])
  const [isBaseLoading, setIsBaseLoading] = useState(false)
  const [recentlyInsertedBase, setRecentlyInsertedBase] = useState<Set<string>>(new Set())
  
  // ExchangeConnectionsActive state (Dashboard - independent status)
  const [exchangeConnectionsActive, setExchangeConnectionsActive] = useState<ExchangeConnection[]>([])
  const [isExchangeConnectionsActiveLoading, setIsExchangeConnectionsActiveLoading] = useState(false)
  const [exchangeConnectionsActiveStatus, setExchangeConnectionsActiveStatus] = useState<Map<string, boolean>>(new Map())
  const [recentlyInsertedActive, setRecentlyInsertedActive] = useState<Set<string>>(new Set())

  // Load all connections for Settings
  const loadBaseConnections = async () => {
    setIsBaseLoading(true)
    try {
      console.log("[v0] [ConnectionState] Loading base connections (all)")
      const response = await fetch("/api/settings/connections")
      if (response.ok) {
        const data = await response.json()
        console.log("[v0] [ConnectionState] Loaded", data.connections?.length || 0, "base connections")
        setBaseConnections(data.connections || [])
      }
    } catch (error) {
      console.error("[v0] [ConnectionState] Failed to load base connections:", error)
    } finally {
      setIsBaseLoading(false)
    }
  }

  // Load enabled connections for Dashboard with independent status tracking
  const loadExchangeConnectionsActive = async () => {
    setIsExchangeConnectionsActiveLoading(true)
    try {
      console.log("[v0] [ConnectionState] Loading ExchangeConnectionsActive (enabled only)")
      const response = await fetch("/api/settings/connections?enabled=true")
      if (response.ok) {
        const data = await response.json()
        const connections = data.connections || []
        console.log("[v0] [ConnectionState] Loaded", connections.length, "ExchangeConnectionsActive")
        setExchangeConnectionsActive(connections)
        
        // Initialize status map for each connection (default: inactive/disabled)
        const statusMap = new Map<string, boolean>()
        connections.forEach((conn: ExchangeConnection) => {
          statusMap.set(conn.id, false) // default: not active in dashboard
        })
        setExchangeConnectionsActiveStatus(statusMap)
      }
    } catch (error) {
      console.error("[v0] [ConnectionState] Failed to load ExchangeConnectionsActive:", error)
    } finally {
      setIsExchangeConnectionsActiveLoading(false)
    }
  }

  // Toggle ExchangeConnectionsActive status independently
  const toggleExchangeConnectionsActiveStatus = (id: string) => {
    setExchangeConnectionsActiveStatus(prev => {
      const next = new Map(prev)
      const currentStatus = next.get(id) ?? false
      next.set(id, !currentStatus)
      console.log("[v0] [ConnectionState] Toggled ExchangeConnectionsActive", id, "to", !currentStatus)
      return next
    })
  }

  // Mark connection as recently inserted
  const markAsInserted = (id: string, type: "base" | "active") => {
    console.log("[v0] [ConnectionState] Marking", id, "as inserted in", type)
    if (type === "base") {
      setRecentlyInsertedBase(prev => new Set(prev).add(id))
    } else {
      setRecentlyInsertedActive(prev => new Set(prev).add(id))
    }
    
    // Auto-clear after 5 seconds
    setTimeout(() => {
      clearInserted(id, type)
    }, 5000)
  }

  // Clear inserted marker
  const clearInserted = (id: string, type: "base" | "active") => {
    if (type === "base") {
      setRecentlyInsertedBase(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } else {
      setRecentlyInsertedActive(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Initial load on mount
  useEffect(() => {
    loadBaseConnections()
    loadExchangeConnectionsActive()
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadBaseConnections()
      loadExchangeConnectionsActive()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <ConnectionStateContext.Provider
      value={{
        baseConnections,
        setBaseConnections,
        loadBaseConnections,
        isBaseLoading,
        exchangeConnectionsActive,
        setExchangeConnectionsActive,
        loadExchangeConnectionsActive,
        isExchangeConnectionsActiveLoading,
        exchangeConnectionsActiveStatus,
        toggleExchangeConnectionsActiveStatus,
        recentlyInsertedBase,
        recentlyInsertedActive,
        markAsInserted,
        clearInserted,
      }}
    >
      {children}
    </ConnectionStateContext.Provider>
  )
}

export function useConnectionState() {
  const context = useContext(ConnectionStateContext)
  if (!context) {
    throw new Error("useConnectionState must be used within ConnectionStateProvider")
  }
  return context
}
