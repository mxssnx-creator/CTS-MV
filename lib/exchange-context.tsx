"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface ExchangeContextType {
  selectedExchange: string | null
  setSelectedExchange: (exchange: string | null) => void
  activeConnections: any[]
  loadActiveConnections: () => Promise<void>
}

const ExchangeContext = createContext<ExchangeContextType | undefined>(undefined)

export function ExchangeProvider({ children }: { children: ReactNode }) {
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null)
  const [activeConnections, setActiveConnections] = useState<any[]>([])

  const loadActiveConnections = async () => {
    try {
      console.log("[v0] [Exchange Context] Loading all connections for exchange selector...")
      // Load ALL connections, not just enabled/active ones
      const response = await fetch("/api/settings/connections")
      if (response.ok) {
        const data = await response.json()
        const connections = data.connections || []
        setActiveConnections(connections)
        console.log("[v0] [Exchange Context] Loaded", connections.length, "connections")
        
        // Auto-select first connection if none selected
        if (!selectedExchange && connections.length > 0) {
          setSelectedExchange(connections[0].exchange)
          console.log("[v0] [Exchange Context] Auto-selected:", connections[0].exchange)
        }
      }
    } catch (error) {
      console.error("[v0] [Exchange Context] Failed to load connections:", error)
    }
  }

  useEffect(() => {
    loadActiveConnections()
    
    // Refresh active connections every 30 seconds
    const interval = setInterval(loadActiveConnections, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <ExchangeContext.Provider
      value={{
        selectedExchange,
        setSelectedExchange,
        activeConnections,
        loadActiveConnections,
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
