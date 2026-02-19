"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { useExchange } from "@/lib/exchange-context"
import { useConnectionState } from "@/lib/connection-state"
import { SystemOverview } from "./system-overview"
import { GlobalTradeEngineControls } from "./global-trade-engine-controls"
import { ConnectionCard } from "./connection-card"
import { AddActiveConnectionDialog } from "@/components/dashboard/add-active-connection-dialog"
import { IntervalsStrategiesOverview } from "./intervals-strategies-overview"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import type { ExchangeConnection } from "@/lib/types"

export function Dashboard() {
  const { user } = useAuth()
  const { selectedExchange } = useExchange()
  const { 
    exchangeConnectionsActive, 
    setExchangeConnectionsActive,
    loadExchangeConnectionsActive, 
    isExchangeConnectionsActiveLoading,
    exchangeConnectionsActiveStatus,
    toggleExchangeConnectionsActiveStatus,
    recentlyInsertedActive,
    markAsInserted 
  } = useConnectionState()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
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

  const handleToggleEnable = async (id: string, enabled: boolean) => {
    try {
      const connection = filteredConnections.find(c => c.id === id)
      if (!connection) {
        toast.error("Connection not found")
        return
      }

      // IMMEDIATE UI UPDATE: Optimistically update the connection state before API call completes
      const updatedConnection = {
        ...connection,
        is_enabled: enabled,
        is_live_trade: enabled ? connection.is_live_trade : false,
        is_preset_trade: enabled ? connection.is_preset_trade : false,
        updated_at: new Date().toISOString(),
      }
      
      // Update the local state immediately for instant UI feedback
      setExchangeConnectionsActive(prev => 
        prev.map(c => c.id === id ? updatedConnection : c)
      )

      const response = await fetch(`/api/settings/connections/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_enabled: enabled,
          is_live_trade: enabled ? connection.is_live_trade : false,
          is_preset_trade: enabled ? connection.is_preset_trade : false,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        console.log("[v0] [Dashboard] Toggle successful - engine status:", result.engineStatus)
        
        // Update state with the confirmed response from server
        if (result.connection) {
          setExchangeConnectionsActive(prev => 
            prev.map(c => c.id === id ? result.connection : c)
          )
        }
        
        toast.success(`Connection ${enabled ? "enabled - trade engine starting..." : "disabled - trade engine stopped"}`)
        
        // Refresh in background immediately and then again after 1s to catch engine status
        await loadExchangeConnectionsActive()
        setTimeout(() => loadExchangeConnectionsActive(), 1000)
      } else {
        const error = await response.json()
        // Revert optimistic update on error
        setExchangeConnectionsActive(prev => 
          prev.map(c => c.id === id ? connection : c)
        )
        toast.error(error.details || "Failed to toggle connection")
      }
    } catch (error) {
      console.error("[v0] Failed to toggle connection:", error)
      toast.error("Failed to toggle connection")
      // Revert optimistic update on error - reload to ensure consistency
      await loadExchangeConnectionsActive()
    }
  }

  const handleToggleLiveTrade = async (id: string, enabled: boolean) => {
    try {
      const connection = filteredConnections.find(c => c.id === id)
      if (!connection) {
        toast.error("Connection not found")
        return
      }

      if (!connection.is_enabled && enabled) {
        toast.error("Please enable the connection first")
        return
      }

      const response = await fetch(`/api/settings/connections/${id}/live-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_live_trade: enabled }),
      })

      if (response.ok) {
        toast.success(`Live trading ${enabled ? "enabled" : "disabled"}`)
        await loadExchangeConnectionsActive()
      } else {
        const error = await response.json()
        toast.error(error.details || error.error || "Failed to toggle live trading")
      }
    } catch (error) {
      console.error("[v0] Failed to toggle live trading:", error)
      toast.error("Failed to toggle live trading")
    }
  }

  const handleTogglePresetTrade = async (id: string, enabled: boolean) => {
    try {
      const connection = filteredConnections.find(c => c.id === id)
      if (!connection) {
        toast.error("Connection not found")
        return
      }

      if (!connection.is_enabled && enabled) {
        toast.error("Please enable the connection first")
        return
      }

      // Call the preset-toggle endpoint (controls Preset Engine)
      const response = await fetch(`/api/settings/connections/${id}/preset-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_preset_trade: enabled,
        }),
      })

      if (response.ok) {
        toast.success(`Preset trading ${enabled ? "enabled" : "disabled"}`)
        await loadExchangeConnectionsActive()
      } else {
        const error = await response.json()
        toast.error(error.details || error.error || "Failed to toggle preset trading")
      }
    } catch (error) {
      console.error("[v0] Failed to toggle preset trading:", error)
      toast.error("Failed to toggle preset trading")
    }
  }

  const handleDeleteConnection = async (id: string) => {
    try {
      const response = await fetch(`/api/settings/connections/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast.success("Connection deleted successfully")
        await loadExchangeConnectionsActive()
      } else {
        const error = await response.json()
        toast.error(error.details || error.error || "Failed to delete connection")
      }
    } catch (error) {
      console.error("[v0] Failed to delete connection:", error)
      toast.error("Failed to delete connection")
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

      {/* Active Connections */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Active Connections</CardTitle>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Connection
          </Button>
        </CardHeader>
        <CardContent>
           {isExchangeConnectionsActiveLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading connections...</p>
          ) : filteredConnections.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No connections configured</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredConnections.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  onToggleEnable={handleToggleEnable}
                  onToggleLiveTrade={handleToggleLiveTrade}
                  onTogglePresetTrade={handleTogglePresetTrade}
                  onDelete={handleDeleteConnection}
                  isActive={exchangeConnectionsActiveStatus.get(connection.id) ?? false}
                  onToggleActive={() => toggleExchangeConnectionsActiveStatus(connection.id)}
                  balance={parseFloat(connection.last_test_balance as any) || 0}
                  status={
                    !(connection.is_enabled === true || (connection.is_enabled as any) === "1" || (connection.is_enabled as any) === "true")
                      ? "disabled"
                      : connection.last_test_status === "success"
                        ? "connected"
                        : connection.last_test_status === "failed"
                          ? "error"
                          : "connecting"
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Intervals & Strategies Overview */}
      {filteredConnections.length > 0 && (
        <IntervalsStrategiesOverview connections={filteredConnections} />
      )}

      <AddActiveConnectionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onConnectionAdded={async (connectionId) => {
          console.log("[v0] [Dashboard] New connection added to active list:", connectionId)
          await loadExchangeConnectionsActive()
          if (connectionId) {
            markAsInserted(connectionId, "active")
          }
        }}
      />
    </div>
  )
}
