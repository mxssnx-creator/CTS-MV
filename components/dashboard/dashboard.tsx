"use client"

import React, { useState, useEffect, useMemo, ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"
import { useExchange } from "@/lib/exchange-context"
import { useConnectionState } from "@/lib/connection-state"
import { SystemOverview } from "./system-overview"
import { GlobalTradeEngineControls } from "./global-trade-engine-controls"
import { DashboardActiveConnectionsManager } from "./dashboard-active-connections-manager"
import { IntervalsStrategiesOverview } from "./intervals-strategies-overview"
import { StatisticsOverview } from "./statistics-overview"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import type { ExchangeConnection } from "@/lib/types"

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode
  name: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error(`[v0] [ErrorBoundary] Error in ${this.props.name}:`, error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700">
            Failed to load {this.props.name}. {this.state.error?.message}
          </p>
        </Card>
      )
    }

    return this.props.children
  }
}

export function Dashboard() {
  const { user } = useAuth()
  const { selectedExchange } = useExchange()
  const { 
    exchangeConnectionsActive, 
    loadExchangeConnectionsActive, 
    isExchangeConnectionsActiveLoading,
  } = useConnectionState()
  const [stats, setStats] = useState({
    activeConnections: 0,
    totalPositions: 0,
    dailyPnL: 0,
    totalBalance: 0,
    indicationsActive: 0,
    strategiesActive: 0,
    systemLoad: 45,
    databaseSize: 128,
  })

  // Filter ExchangeConnectionsActive by selected exchange
  const filteredConnections = useMemo(() => {
    if (!selectedExchange) {
      return exchangeConnectionsActive
    }
    return exchangeConnectionsActive.filter(conn => conn.exchange === selectedExchange)
  }, [exchangeConnectionsActive, selectedExchange])

  useEffect(() => {
    // Initialize all systems on dashboard load
    const initializeSystems = async () => {
      try {
        console.log("[v0] [Dashboard] Initializing systems...")
        
        // Call init endpoint to seed defaults and initialize trade engine
        const initResponse = await fetch("/api/init", { 
          method: "GET",
          cache: "no-store"
        })
        
        if (initResponse.ok) {
          const initData = await initResponse.json()
          console.log("[v0] [Dashboard] Systems initialized:", initData)
          if (initData.defaultConnectionsCreated > 0) {
            toast.info("Trade System", { 
              description: `Initialized ${initData.defaultConnectionsCreated} default exchange connection(s)`
            })
          }
        } else {
          console.warn("[v0] [Dashboard] System initialization returned:", initResponse.status)
        }
        
        // Load all active connections
        await loadExchangeConnectionsActive()
      } catch (error) {
        console.error("[v0] [Dashboard] Failed to initialize systems:", error)
      }
    }
    
    initializeSystems()
    loadStats()
    
    const interval = setInterval(() => {
      loadStats()
    }, 5000)
    
    return () => clearInterval(interval)
  }, [])

  // Reload stats when selected exchange changes
  useEffect(() => {
    console.log("[v0] [Dashboard] Exchange changed to:", selectedExchange)
    loadStats()
  }, [selectedExchange])

  const loadStats = async () => {
    try {
      const url = selectedExchange 
        ? `/api/monitoring/stats?exchange=${selectedExchange}`
        : "/api/monitoring/stats"
      
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setStats({
          activeConnections: data.activeConnections || 0,
          totalPositions: data.totalPositions || 0,
          dailyPnL: data.dailyPnL || 0,
          totalBalance: data.totalBalance || 0,
          indicationsActive: data.indicationsActive || 0,
          strategiesActive: data.strategiesActive || 0,
          systemLoad: data.systemLoad || 45,
          databaseSize: data.databaseSize || 128,
        })
      }
    } catch (error) {
      console.error("Failed to load stats:", error)
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">CTS v3.2 Dashboard</h1>
          <p className="text-muted-foreground text-sm">Monitor and control your active trading connections</p>
        </div>
        <Button onClick={loadExchangeConnectionsActive} size="sm" variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Smart Overview - Comprehensive system status */}
      <ErrorBoundary name="System Overview">
        <SystemOverview />
      </ErrorBoundary>

      {/* Trade Engine Controls */}
      <ErrorBoundary name="Global Trade Engine Controls">
        <GlobalTradeEngineControls />
      </ErrorBoundary>

      {/* Active Connections - With global engine guard, progression tracking, sticky state */}
      <ErrorBoundary name="Active Connections">
        <DashboardActiveConnectionsManager />
      </ErrorBoundary>

      {/* Intervals & Strategies Overview */}
      {filteredConnections.length > 0 && (
        <ErrorBoundary name="Intervals & Strategies">
          <IntervalsStrategiesOverview connections={filteredConnections} />
        </ErrorBoundary>
      )}

      {/* Statistics Overview - Indications, Strategies, Performance Metrics for ALL connections */}
      {filteredConnections.length > 0 && (
        <div className="col-span-full">
          <ErrorBoundary name="Statistics Overview">
            <StatisticsOverview connections={filteredConnections} />
          </ErrorBoundary>
        </div>
      )}


    </div>
  )
}
