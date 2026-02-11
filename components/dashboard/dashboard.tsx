"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { useExchange } from "@/lib/exchange-context"
import { useConnectionState } from "@/lib/connection-state"
import { SystemOverview } from "./system-overview"
import { GlobalTradeEngineControls } from "./global-trade-engine-controls"
import { ConnectionCard } from "./connection-card"
import { AddConnectionDialog } from "@/components/settings/add-connection-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import type { ExchangeConnection } from "@/lib/types"

export function Dashboard() {
  const { user } = useAuth()
  const { selectedExchange } = useExchange()
  const { 
    activeConnections, 
    loadActiveConnections, 
    isActiveLoading,
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

  // Filter active connections by selected exchange
  const filteredConnections = useMemo(() => {
    if (!selectedExchange) {
      return activeConnections
    }
    return activeConnections.filter(conn => conn.exchange === selectedExchange)
  }, [activeConnections, selectedExchange])

  useEffect(() => {
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
      const connection = connections.find(c => c.id === id)
      if (!connection) {
        toast.error("Connection not found")
        return
      }

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
        toast.success(`Connection ${enabled ? "enabled" : "disabled"}`)
        await loadConnections()
      } else {
        const error = await response.json()
        toast.error(error.details || "Failed to toggle connection")
      }
    } catch (error) {
      console.error("[v0] Failed to toggle connection:", error)
      toast.error("Failed to toggle connection")
    }
  }

  const handleToggleLiveTrade = async (id: string, enabled: boolean) => {
    try {
      const connection = connections.find(c => c.id === id)
      if (!connection) {
        toast.error("Connection not found")
        return
      }

      if (!connection.is_enabled && enabled) {
        toast.error("Please enable the connection first")
        return
      }

      const response = await fetch(`/api/settings/connections/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_enabled: connection.is_enabled,
          is_live_trade: enabled,
          is_preset_trade: connection.is_preset_trade,
        }),
      })

      if (response.ok) {
        toast.success(`Live trading ${enabled ? "enabled" : "disabled"}`)
        await loadConnections()
      } else {
        const error = await response.json()
        toast.error(error.details || "Failed to toggle live trading")
      }
    } catch (error) {
      console.error("[v0] Failed to toggle live trading:", error)
      toast.error("Failed to toggle live trading")
    }
  }

  const handleDeleteConnection = async (id: string) => {
    if (!confirm("Are you sure you want to delete this connection?")) return

    try {
      const response = await fetch(`/api/settings/connections/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast.success("Connection deleted")
        await loadConnections()
      } else {
        toast.error("Failed to delete connection")
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
          <h1 className="text-3xl font-bold">CTS v3.2 Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.username || "Administrator"}</p>
        </div>
        <Button onClick={loadActiveConnections} size="sm" variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* System Overview & Trade Engine Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SystemOverview stats={stats} />
        </div>
        <div>
          <GlobalTradeEngineControls />
        </div>
      </div>

      {/* Exchange Connections */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Exchange Connections</CardTitle>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Connection
          </Button>
        </CardHeader>
        <CardContent>
           {isActiveLoading ? (
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
                  onDelete={handleDeleteConnection}
                  status={
                    !connection.is_enabled
                      ? "disabled"
                      : connection.is_live_trade
                        ? "connected"
                        : "connecting"
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddConnectionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onConnectionAdded={async (connectionId) => {
          console.log("[v0] [Dashboard] New connection added:", connectionId)
          await loadActiveConnections()
          if (connectionId) {
            markAsInserted(connectionId, "active")
          }
        }}
      />
    </div>
  )
}
