"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"

interface ExchangeContextType {
  selectedExchange: string | null
  setSelectedExchange: (exchange: string | null) => void
  activeConnections: any[]
  loadActiveConnections: () => Promise<void>
  isLoading: boolean
}

const ExchangeContext = createContext<ExchangeContextType | undefined>(undefined)

export function ExchangeProvider({ children }: { children: ReactNode }) {
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null)
  const [activeConnections, setActiveConnections] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false)
  const lastLoadRef = useRef(0)
  const LOAD_COOLDOWN = 60000 // 60 seconds between refreshes

  const loadActiveConnections = async () => {
    // Prevent concurrent requests and excessive refreshes
    if (loadingRef.current) return
    if (Date.now() - lastLoadRef.current < LOAD_COOLDOWN) return

    loadingRef.current = true
    setIsLoading(true)
    try {
      console.log("[v0] [Exchange Context] Loading dashboard active connections for exchange selector...")
      // Load ONLY connections that are added to active list (is_enabled_dashboard="1")
      const response = await fetch("/api/settings/connections?dashboard=true", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
      if (response.ok) {
        const data = await response.json()
        const connections = data.connections || []
        
        // Filter to only show dashboard-active connections (is_enabled_dashboard=1 or true)
        const dashboardActive = connections.filter((c: any) => {
          const isDashboardEnabled = c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === "true"
          return isDashboardEnabled
        })
        
        setActiveConnections(dashboardActive)
        console.log("[v0] [Exchange Context] Loaded", dashboardActive.length, "dashboard-active connections from", connections.length, "total")
        
        // Auto-select first connection if none selected
        if (!selectedExchange && dashboardActive.length > 0) {
          setSelectedExchange(dashboardActive[0].exchange)
        }
      }
    } catch (error) {
      console.error("[v0] [Exchange Context] Failed to load connections:", error)
    } finally {
      loadingRef.current = false
      setIsLoading(false)
      lastLoadRef.current = Date.now()
    }
  }

  // Only load on mount, remove interval to prevent loops
  useEffect(() => {
    loadActiveConnections()
  }, []) // Empty dependency array - load once on mount only

  return (
    <ExchangeContext.Provider
      value={{
        selectedExchange,
        setSelectedExchange,
        activeConnections,
        loadActiveConnections,
        isLoading,
      }}
    >
      {children}
    </ExchangeContext.Provider>
  )
}

export function useExchange() {
  const context = useContext(ExchangeContext)
  if (context === undefined) {
    throw new Error("useExchange must be used within an ExchangeProvider")
  }
  return context
}
