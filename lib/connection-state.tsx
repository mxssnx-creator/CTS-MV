"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import type { ExchangeConnection } from "@/lib/types"

interface TradeEngineStatus {
  connectionId: string
  status: "idle" | "starting" | "running" | "stopped" | "failed"
  lastUpdated: number
  progressionData?: {
    cycles_completed: number
    successful_cycles: number
    cycle_success_rate: string
    trades: number
    positions: number
  }
}

interface ConnectionState {
  // Base connections (all connections from database) - used in Settings
  baseConnections: ExchangeConnection[]
  setBaseConnections: (connections: ExchangeConnection[]) => void
  loadBaseConnections: () => Promise<void>
  isBaseLoading: boolean
  baseConnectionStatuses: Map<string, { enabled: boolean; inserted: boolean }> // independent status tracking
  setBaseConnectionStatus: (id: string, enabled: boolean) => void
  markBaseAsInserted: (id: string) => void
  
  // ExchangeConnectionsActive (enabled only) - used in Dashboard with independent status
  exchangeConnectionsActive: ExchangeConnection[]
  setExchangeConnectionsActive: (connections: ExchangeConnection[]) => void
  loadExchangeConnectionsActive: () => Promise<void>
  isExchangeConnectionsActiveLoading: boolean
  
  // ExchangeConnectionsActive status management - independent from settings
  exchangeConnectionsActiveStatus: Map<string, boolean> // id -> is_active
  toggleExchangeConnectionsActiveStatus: (id: string) => void
  markExchangeAsInserted: (id: string) => void
  exchangeConnectionsInsertedStatus: Set<string>
  
  // Trade Engine Status - independent from connection status
  tradeEngineStatuses: Map<string, TradeEngineStatus>
  updateTradeEngineStatus: (connectionId: string, status: TradeEngineStatus) => void
  getTradeEngineStatus: (connectionId: string) => TradeEngineStatus | undefined
}

const ConnectionStateContext = createContext<ConnectionState | undefined>(undefined)

export function ConnectionStateProvider({ children }: { children: ReactNode }) {
  // Base connections state (Settings)
  const [baseConnections, setBaseConnections] = useState<ExchangeConnection[]>([])
  const [isBaseLoading, setIsBaseLoading] = useState(false)
  const [baseConnectionStatuses, setBaseConnectionStatuses] = useState<Map<string, { enabled: boolean; inserted: boolean }>>(new Map())
  
  // ExchangeConnectionsActive state (Dashboard - independent status)
  const [exchangeConnectionsActive, setExchangeConnectionsActive] = useState<ExchangeConnection[]>([])
  const [isExchangeConnectionsActiveLoading, setIsExchangeConnectionsActiveLoading] = useState(false)
  const [exchangeConnectionsActiveStatus, setExchangeConnectionsActiveStatus] = useState<Map<string, boolean>>(new Map())
  const [exchangeConnectionsInsertedStatus, setExchangeConnectionsInsertedStatus] = useState<Set<string>>(new Set())
  
  // Trade Engine Status - independent from connections
  const [tradeEngineStatuses, setTradeEngineStatuses] = useState<Map<string, TradeEngineStatus>>(new Map())
  
  // Prevent concurrent loads and excessive queries
  const loadingRef = useRef<{ base: boolean; active: boolean }>({ base: false, active: false })
  const lastLoadRef = useRef<{ base: number; active: number }>({ base: 0, active: 0 })
  const LOAD_COOLDOWN = 5000 // 5 seconds between same-type loads (reduced from 30s for better UX)

  // Load all connections for Settings (single unified function)
  const loadBaseConnections = async () => {
    // Prevent concurrent requests
    if (loadingRef.current.base) return
    
    // Prevent excessive refreshes
    if (Date.now() - lastLoadRef.current.base < LOAD_COOLDOWN) return

    loadingRef.current.base = true
    setIsBaseLoading(true)
    try {
      console.log("[v0] [ConnectionState] Loading base connections (all)")
      const response = await fetch("/api/settings/connections")
      if (response.ok) {
        const data = await response.json()
        console.log("[v0] [ConnectionState] Loaded", data.connections?.length || 0, "base connections")
        setBaseConnections(data.connections || [])
        
        // Initialize status map
        const statusMap = new Map<string, { enabled: boolean; inserted: boolean }>()
        data.connections?.forEach((conn: ExchangeConnection) => {
          statusMap.set(conn.id, { 
            enabled: conn.is_enabled === true || conn.is_enabled === "true",
            inserted: false 
          })
        })
        setBaseConnectionStatuses(statusMap)
        
        // Also update Active connections if any are marked as actively using
        const activeConns = data.connections?.filter((c: ExchangeConnection) => 
          c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1"
        ) || []
        
        if (activeConns.length > 0) {
          setExchangeConnectionsActive(activeConns)
          const activeStatusMap = new Map<string, boolean>()
          activeConns.forEach((conn: ExchangeConnection) => {
            activeStatusMap.set(conn.id, conn.is_enabled === true || conn.is_enabled === "1")
          })
          setExchangeConnectionsActiveStatus(activeStatusMap)
          console.log("[v0] [ConnectionState] Updated Active Connections:", activeConns.length)
        }
      }
    } catch (error) {
      console.error("[v0] [ConnectionState] Failed to load base connections:", error)
    } finally {
      loadingRef.current.base = false
      setIsBaseLoading(false)
      lastLoadRef.current.base = Date.now()
    }
  }

  // Load ALL BASE connections for Active Connections list
  // Shows the 4 primary exchanges (bybit, bingx, pionex, orangex) as connection cards
  // The toggle controls is_enabled_dashboard (independent from Settings is_enabled)
  const loadExchangeConnectionsActive = async () => {
    // Prevent concurrent requests
    if (loadingRef.current.active) return
    
    // Prevent excessive refreshes
    if (Date.now() - lastLoadRef.current.active < LOAD_COOLDOWN) return

    loadingRef.current.active = true
    setIsExchangeConnectionsActiveLoading(true)
    try {
      const response = await fetch("/api/settings/connections")
      if (response.ok) {
        const data = await response.json()
        const allConnections = data.connections || []
        
        // Show ALL inserted connections (not just 4 hardcoded exchanges)
        // Matches the same logic as DashboardActiveConnectionsManager
        const BASE_EXCHANGES = ["bybit", "bingx", "pionex", "orangex"]
        const activeConns = allConnections.filter((c: any) => {
          const exchange = (c.exchange || "").toLowerCase().trim()
          const isBase = BASE_EXCHANGES.includes(exchange)
          const isInserted = c.is_inserted === true || c.is_inserted === "1" || c.is_inserted === "true"
          const isDashboardActive = c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === "true"
          return isBase || isInserted || isDashboardActive
        })
        
        setExchangeConnectionsActive(activeConns)
        
        // Initialize status map - use is_enabled_dashboard for the active toggle (independent)
        const statusMap = new Map<string, boolean>()
        activeConns.forEach((conn: ExchangeConnection) => {
          const isDashboardEnabled = (conn as any).is_enabled_dashboard === true || (conn as any).is_enabled_dashboard === "1" || (conn as any).is_enabled_dashboard === "true"
          statusMap.set(conn.id, isDashboardEnabled)
        })
        setExchangeConnectionsActiveStatus(statusMap)
      }
    } catch (error) {
      console.error("[v0] [ConnectionState] Failed to load Active Connections:", error)
    } finally {
      loadingRef.current.active = false
      setIsExchangeConnectionsActiveLoading(false)
      lastLoadRef.current.active = Date.now()
    }
  }

  // Set base connection status (enabled/disabled)
  const setBaseConnectionStatus = (id: string, enabled: boolean) => {
    setBaseConnectionStatuses(prev => {
      const next = new Map(prev)
      const current = next.get(id) || { enabled: false, inserted: false }
      next.set(id, { ...current, enabled })
      return next
    })
  }

  // Mark base connection as inserted
  const markBaseAsInserted = (id: string) => {
    setBaseConnectionStatuses(prev => {
      const next = new Map(prev)
      const current = next.get(id) || { enabled: false, inserted: false }
      next.set(id, { ...current, inserted: true })
      return next
    })
    
    // Auto-clear after 5 seconds
    setTimeout(() => {
      setBaseConnectionStatuses(prev => {
        const next = new Map(prev)
        const current = next.get(id) || { enabled: false, inserted: false }
        next.set(id, { ...current, inserted: false })
        return next
      })
    }, 5000)
  }

  // Toggle Active Connection status independently (NEVER affects Settings)
  const toggleExchangeConnectionsActiveStatus = (id: string) => {
    setExchangeConnectionsActiveStatus(prev => {
      const next = new Map(prev)
      const currentStatus = next.get(id) ?? false
      next.set(id, !currentStatus)
      console.log("[v0] [ConnectionState] Toggled Active Connection", id, "to", !currentStatus, "(independent from Settings)")
      return next
    })
  }

  // Mark exchange connection as inserted to active list
  const markExchangeAsInserted = (id: string) => {
    setExchangeConnectionsInsertedStatus(prev => new Set(prev).add(id))
    
    // Auto-clear after 5 seconds
    setTimeout(() => {
      setExchangeConnectionsInsertedStatus(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 5000)
  }

  // Update trade engine status (independent from connection status)
  const updateTradeEngineStatus = (connectionId: string, status: TradeEngineStatus) => {
    setTradeEngineStatuses(prev => {
      const next = new Map(prev)
      next.set(connectionId, { ...status, lastUpdated: Date.now() })
      return next
    })
  }

  // Get trade engine status
  const getTradeEngineStatus = (connectionId: string): TradeEngineStatus | undefined => {
    return tradeEngineStatuses.get(connectionId)
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
        baseConnectionStatuses,
        setBaseConnectionStatus,
        markBaseAsInserted,
        exchangeConnectionsActive,
        setExchangeConnectionsActive,
        loadExchangeConnectionsActive,
        isExchangeConnectionsActiveLoading,
        exchangeConnectionsActiveStatus,
        toggleExchangeConnectionsActiveStatus,
        markExchangeAsInserted,
        exchangeConnectionsInsertedStatus,
        tradeEngineStatuses,
        updateTradeEngineStatus,
        getTradeEngineStatus,
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
