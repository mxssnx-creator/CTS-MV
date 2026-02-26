"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { useExchange } from "@/lib/exchange-context"
import { useConnectionState } from "@/lib/connection-state"
import { SystemOverview } from "./system-overview"
import { GlobalTradeEngineControls } from "./global-trade-engine-controls"
import { DashboardActiveConnectionsManager } from "./dashboard-active-connections-manager"
import { IntervalsStrategiesOverview } from "./intervals-strategies-overview"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import type { ExchangeConnection } from "@/lib/types"

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
    // System initialization happens automatically at server startup (instrumentation.ts -> pre-startup.ts)
    // Dashboard only needs to load data
    loadExchangeConnectionsActive()
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
      <SystemOverview />

      {/* Trade Engine Controls */}
      <GlobalTradeEngineControls />

      {/* Active Connections - With global engine guard, progression tracking, sticky state */}
      <DashboardActiveConnectionsManager />

      {/* Intervals & Strategies Overview */}
      {filteredConnections.length > 0 && (
        <IntervalsStrategiesOverview connections={filteredConnections} />
      )}


    </div>
  )
}
