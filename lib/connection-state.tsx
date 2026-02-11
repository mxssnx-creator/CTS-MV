"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { ExchangeConnection } from "@/lib/types"

interface ConnectionState {
  // Base connections (all connections from database) - used in Settings
  baseConnections: ExchangeConnection[]
  setBaseConnections: (connections: ExchangeConnection[]) => void
  loadBaseConnections: () => Promise<void>
  isBaseLoading: boolean
  
  // Active connections (enabled only) - used in Dashboard
  activeConnections: ExchangeConnection[]
  setActiveConnections: (connections: ExchangeConnection[]) => void
  loadActiveConnections: () => Promise<void>
  isActiveLoading: boolean
  
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
  
  // Active connections state (Dashboard)
  const [activeConnections, setActiveConnections] = useState<ExchangeConnection[]>([])
  const [isActiveLoading, setIsActiveLoading] = useState(false)
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

  // Load enabled connections for Dashboard
  const loadActiveConnections = async () => {
    setIsActiveLoading(true)
    try {
      console.log("[v0] [ConnectionState] Loading active connections (enabled only)")
      const response = await fetch("/api/settings/connections?enabled=true")
      if (response.ok) {
        const data = await response.json()
        console.log("[v0] [ConnectionState] Loaded", data.connections?.length || 0, "active connections")
        setActiveConnections(data.connections || [])
      }
    } catch (error) {
      console.error("[v0] [ConnectionState] Failed to load active connections:", error)
    } finally {
      setIsActiveLoading(false)
    }
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
    loadActiveConnections()
    
    // Refresh active connections periodically
    const interval = setInterval(() => {
      loadActiveConnections()
    }, 30000) // Every 30 seconds
    
    return () => clearInterval(interval)
  }, [])

  return (
    <ConnectionStateContext.Provider
      value={{
        baseConnections,
        setBaseConnections,
        loadBaseConnections,
        isBaseLoading,
        activeConnections,
        setActiveConnections,
        loadActiveConnections,
        isActiveLoading,
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
