"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, AlertTriangle } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import type { Connection } from "@/lib/redis-db"
import type { ActiveConnection } from "@/lib/active-connections"
import { BASE_EXCHANGES } from "@/lib/connection-utils"
import { AddActiveConnectionDialog } from "./add-active-connection-dialog"
import { ActiveConnectionCard } from "./active-connection-card"

interface ActiveConnectionWithDetails extends ActiveConnection {
  details?: Connection
}

export function DashboardActiveConnectionsManager() {
  const [activeConnections, setActiveConnections] = useState<ActiveConnectionWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [globalEngineRunning, setGlobalEngineRunning] = useState(false)
  const [globalEngineLoading, setGlobalEngineLoading] = useState(true)
  const globalEngineRef = React.useRef(false)
  const activeConnectionsRef = React.useRef<ActiveConnectionWithDetails[]>([])

  const updateActiveConnections = (updater: ActiveConnectionWithDetails[] | ((prev: ActiveConnectionWithDetails[]) => ActiveConnectionWithDetails[])) => {
    if (typeof updater === "function") {
      setActiveConnections(prev => {
        const next = updater(prev)
        activeConnectionsRef.current = next
        return next
      })
    } else {
      activeConnectionsRef.current = updater
      setActiveConnections(updater)
    }
  }

  const checkGlobalEngine = async () => {
    try {
      const res = await fetch("/api/trade-engine/status")
      if (res.ok) {
        const data = await res.json()
        const wasRunning = globalEngineRef.current
        const nowRunning = data.running === true
        globalEngineRef.current = nowRunning
        setGlobalEngineRunning(nowRunning)
        if (!wasRunning && nowRunning) {
          loadConnections()
        }
      }
    } catch {
      // Keep previous state on error
    } finally {
      setGlobalEngineLoading(false)
    }
  }

  useEffect(() => {
    loadConnections()
    checkGlobalEngine()
    const connInterval = setInterval(loadConnections, 5000)
    const engineInterval = setInterval(checkGlobalEngine, 3000)
    return () => {
      clearInterval(connInterval)
      clearInterval(engineInterval)
    }
  }, [])

  const loadConnections = async () => {
    try {
      // Fetch ALL connections via API (works on the client, unlike direct Redis)
      const response = await fetch("/api/settings/connections")
      if (!response.ok) {
        setLoading(false)
        return
      }
      const data = await response.json()
      const allConnections: Connection[] = Array.isArray(data) ? data : (data?.connections || [])
      
      // Build active connection cards from API data
      const activeConns: ActiveConnectionWithDetails[] = []
      const seenIds = new Set<string>()

      console.log(`[v0] [Manager] Processing ${allConnections.length} connections from API`)
      
      for (const conn of allConnections) {
        const exchange = (conn.exchange || "").toLowerCase().trim()
        const isBase = BASE_EXCHANGES.includes(exchange)
        
        // Dashboard uses its OWN states - completely independent from Settings
        const isDashboardInserted = conn.is_dashboard_inserted === true || conn.is_dashboard_inserted === "1"
        const isDashboardActive = conn.is_enabled_dashboard === true || conn.is_enabled_dashboard === "1"

        console.log(`[v0] [Manager] ${conn.name}: base=${isBase}, dashboard_inserted=${isDashboardInserted} (raw: ${JSON.stringify(conn.is_dashboard_inserted)}), dashboard_active=${isDashboardActive}`)
        
        // Show ONLY base connections that are inserted on DASHBOARD (not Settings is_inserted)
        if (isBase && isDashboardInserted) {
          if (seenIds.has(conn.id)) continue
          seenIds.add(conn.id)

          activeConns.push({
            id: `active-${conn.id}`,
            connectionId: conn.id,
            exchangeName: conn.exchange ? conn.exchange.charAt(0).toUpperCase() + conn.exchange.slice(1) : "Unknown",
            isActive: isDashboardActive, // DISABLED by default - only true if explicitly enabled
            isBaseEnabled: true, // Always allow dashboard operations
            addedAt: conn.created_at || new Date().toISOString(),
            details: conn,
          })
          console.log(`[v0] [Manager] ✓ Added ${conn.name} to dashboard`)
        }
      }
      
      console.log(`[v0] [Manager] Final: ${activeConns.length} connections on dashboard`)
      
      // STICKY STATE: Never replace existing cards with empty data on transient fetch issues
      if (activeConns.length === 0 && activeConnectionsRef.current.length > 0) {
        setLoading(false)
        return
      }

      updateActiveConnections(activeConns)
    } catch (error) {
      console.error("[v0] Error loading connections:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (connectionId: string, currentState: boolean) => {
    const newState = !currentState
    
    // Block enabling if global engine is not running
    if (newState && !globalEngineRunning) {
      toast.error("Cannot activate connection", {
        description: "Global Trade Engine must be running first. Start it from the Trade Engine controls.",
      })
      return
    }
    
    setTogglingIds(prev => new Set(prev).add(connectionId))
    
    const connInfo = activeConnections.find(ac => ac.connectionId === connectionId)
    const connName = connInfo?.exchangeName ? `${connInfo.exchangeName} (${connectionId})` : connectionId
    
    try {
      console.log(`[v0] [Manager] ${newState ? "ENABLING" : "DISABLING"} connection: ${connName}`)
      
      // 1. Toggle active state via API (independent from Settings base connections)
      await fetch(`/api/settings/connections/${connectionId}/toggle-dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled_dashboard: newState }),
      })
      
      // 2. Update local state immediately for responsiveness
      updateActiveConnections(prev => prev.map(ac =>
        ac.connectionId === connectionId ? { ...ac, isActive: newState } : ac
      ))

      // 3. Start or stop the trade engine for this connection
      if (newState) {
        // Enabling: Start the connection engine via live-trade endpoint
        console.log(`[v0] [Manager] Starting engine for: ${connName}`)
        const startRes = await fetch(`/api/settings/connections/${connectionId}/live-trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_live_trade: true }),
        })
        
        if (!startRes.ok) {
          const errorData = await startRes.json().catch(() => ({ error: "Unknown error" }))
          console.warn(`[v0] [Manager] Engine start warning for ${connName}: ${errorData.error}`)
          toast.warning("Connection enabled", {
            description: `Active but engine: ${errorData.error || "could not start"}`,
          })
        } else {
          console.log(`[v0] [Manager] ✓ Engine started for: ${connName}`)
          toast.success("Connection activated", {
            description: "Engine starting - loading historical data...",
          })
        }
      } else {
        // Disabling: Stop the connection engine
        console.log(`[v0] [Manager] Stopping engine for: ${connName}`)
        await fetch(`/api/settings/connections/${connectionId}/live-trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_live_trade: false }),
        })
        
        console.log(`[v0] [Manager] ✓ Engine stopped for: ${connName}`)
        toast.success("Connection deactivated", {
          description: "Engine stopped",
        })
      }

      // Dispatch event for other components to refresh
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("connection-toggled", {
          detail: { connectionId, newState }
        }))
      }
      console.log(`[v0] [Manager] ✓ Successfully toggled: ${connName} → ${newState ? "ACTIVE" : "INACTIVE"}`)
      
      // Refresh active connections to reflect the toggle
      setTimeout(() => {
        loadConnections()
      }, 500)
    } catch (error) {
      console.error(`[v0] [Manager] ✗ Toggle error for ${connName}:`, error)
      // Revert local state on error
      updateActiveConnections(prev => prev.map(ac =>
        ac.connectionId === connectionId ? { ...ac, isActive: currentState } : ac
      ))
      toast.error("Failed to update connection status")
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(connectionId)
        return next
      })
    }
  }

  const handleRemove = async (connectionId: string, connectionName: string) => {
    try {
      // Stop engine first if running
      await fetch(`/api/settings/connections/${connectionId}/live-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_live_trade: false }),
      })
      
      // Remove from dashboard via API
      await fetch(`/api/settings/connections/${connectionId}/toggle-dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled_dashboard: false }),
      })
      updateActiveConnections(prev => prev.filter(ac => ac.connectionId !== connectionId))
      toast.success("Connection removed", {
        description: `${connectionName} has been removed from active connections`
      })
    } catch (error) {
      toast.error("Failed to remove connection")
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading active connections...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Active Connections</h3>
          <p className="text-xs text-muted-foreground">
            All connections disabled by default. Enable to start engine progression.
          </p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          size="sm"
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Add Connection
        </Button>
      </div>

      <AddActiveConnectionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onConnectionAdded={() => loadConnections()}
      />

      {!globalEngineLoading && !globalEngineRunning && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Global Trade Engine is not running
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Start the Global Trade Engine first before activating individual connections.
            </p>
          </div>
        </div>
      )}

      {activeConnections.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p className="mb-3">No base connections found</p>
            <p className="text-sm text-muted-foreground">Configure connections in Settings first.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {activeConnections.map((conn) => (
            <ActiveConnectionCard
              key={conn.id}
              connection={conn}
              expanded={expandedId === conn.id}
              onExpand={(open) => setExpandedId(open ? conn.id : null)}
              onToggle={handleToggle}
              onRemove={handleRemove}
              isToggling={togglingIds.has(conn.connectionId)}
              globalEngineRunning={globalEngineRunning}
            />
          ))}
        </div>
      )}
    </div>
  )
}
