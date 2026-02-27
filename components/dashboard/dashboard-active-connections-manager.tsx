"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, AlertTriangle } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import type { Connection } from "@/lib/redis-db"
import type { ActiveConnection } from "@/lib/active-connections"
import { BASE_EXCHANGES } from "@/lib/connection-utils"
import { COMPONENT_VERSIONS } from "@/lib/system-version"
import { AddActiveConnectionDialog } from "./add-active-connection-dialog"
import { ActiveConnectionCard } from "./active-connection-card"
import { QuickStartButton } from "./quick-start-button"

interface ActiveConnectionWithDetails extends ActiveConnection {
  details?: Connection
}

export function DashboardActiveConnectionsManager() {
  // Version marker with system version tracking - forces browser cache refresh
  const VERSION = `${COMPONENT_VERSIONS.dashboardManager}-20260226`
  
  const [activeConnections, setActiveConnections] = useState<ActiveConnectionWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [globalEngineRunning, setGlobalEngineRunning] = useState(false)
  const [globalEngineLoading, setGlobalEngineLoading] = useState(true)
  const globalEngineRef = React.useRef(false)
  const activeConnectionsRef = React.useRef<ActiveConnectionWithDetails[]>([])

  useEffect(() => {
    console.log(`[v0] [Manager] Component loaded - ${VERSION}`)
  }, [])

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
    console.log(`[v0] [Manager] Initializing active connections manager (version: ${COMPONENT_VERSIONS.dashboardManager})`)
    loadConnections()
    checkGlobalEngine()
    const connInterval = setInterval(loadConnections, 5000)
    const engineInterval = setInterval(checkGlobalEngine, 3000)
    
    // Listen for relevant events and refresh
    const handleEngineStateChange = () => {
      console.log(`[v0] [Manager] Detected engine state change, refreshing...`)
      checkGlobalEngine()
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('engine-state-changed', handleEngineStateChange)
    }
    
    return () => {
      clearInterval(connInterval)
      clearInterval(engineInterval)
      if (typeof window !== 'undefined') {
        window.removeEventListener('engine-state-changed', handleEngineStateChange)
      }
    }
  }, [loadConnections, checkGlobalEngine])

  const loadConnections = async () => {
    try {
      const timestamp = new Date().getTime()
      const response = await fetch(`/api/settings/connections?v=${VERSION}&t=${timestamp}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "X-Component-Version": VERSION,
        },
      })
      
      if (!response.ok) {
        setLoading(false)
        return
      }
      
      const data = await response.json()
      const allConnections: Connection[] = Array.isArray(data) ? data : (data?.connections || [])
      console.log(`[v0] [Manager] Loaded ${allConnections.length} total connections`)
      
      const activeConns: ActiveConnectionWithDetails[] = []
      const seenIds = new Set<string>()
      
      for (const conn of allConnections) {
        const exchange = (conn.exchange || "").toLowerCase().trim()
        const isBase = BASE_EXCHANGES.includes(exchange)
        const isDashboardInserted = conn.is_dashboard_inserted === "1" || conn.is_dashboard_inserted === true
        const isDashboardActive = conn.is_enabled_dashboard === true || conn.is_enabled_dashboard === "1"
        const isEnabled = conn.is_enabled === true || conn.is_enabled === "1"

        // RULE: Only show connections that are:
        // 1. From a base exchange (bybit, bingx, binance, okx, pionex, orangex)
        // 2. Actually added to dashboard (is_dashboard_inserted = 1)
        // 3. Enabled in Settings
        // This ensures only properly configured base exchanges appear, not just any exchange
        if (isBase && isDashboardInserted && isEnabled) {
          if (seenIds.has(conn.id)) continue
          seenIds.add(conn.id)
          activeConns.push({
            id: `active-${conn.id}`,
            connectionId: conn.id,
            exchangeName: conn.exchange ? conn.exchange.charAt(0).toUpperCase() + conn.exchange.slice(1) : "Unknown",
            isActive: isDashboardActive,
            isBaseEnabled: true,
            addedAt: conn.created_at || new Date().toISOString(),
            details: conn,
          })
          console.log(`[v0] [Manager] ✓ Added to active: ${conn.name} (active=${isDashboardActive})`)
        }
      }
      
      console.log(`[v0] [Manager] Filtered ${activeConns.length} active connections from ${allConnections.length} total`)
      updateActiveConnections(activeConns)
    } catch (error) {
      console.error("[v0] Error loading connections:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (connectionId: string, currentState: boolean) => {
    const newState = !currentState
    
    console.log(`[v0] [Manager] Toggle requested: ${connectionId}, current=${currentState}, new=${newState}`)
    
    // Block enabling if global engine is not running
    if (newState && !globalEngineRunning) {
      console.log(`[v0] [Manager] ✗ Cannot enable - global engine not running`)
      toast.error("Cannot activate connection", {
        description: "Global Trade Engine must be running first. Start it from the Trade Engine controls.",
      })
      return
    }
    
    setTogglingIds(prev => new Set(prev).add(connectionId))
    
    const connInfo = activeConnections.find(ac => ac.connectionId === connectionId)
    const connName = connInfo?.exchangeName ? `${connInfo.exchangeName} (${connectionId})` : connectionId
    
    try {
      console.log(`[v0] [Manager] ${newState ? "ENABLING" : "DISABLING"} ${connName}...`)
      
      // 1. Toggle active state via API (also remove from dashboard permanently if disabling)
      console.log(`[v0] [Manager] → Calling toggle-dashboard API...`)
      const toggleRes = await fetch(`/api/settings/connections/${connectionId}/toggle-dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          is_enabled_dashboard: newState,
          // If disabling, also remove from dashboard permanently (is_dashboard_inserted = "0")
          // If enabling, keep dashboard_inserted as is
          ...(newState ? {} : { is_dashboard_inserted: "0" })
        }),
        cache: "no-store"
      })
      
      if (!toggleRes.ok) {
        const errorData = await toggleRes.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(`Toggle API failed: ${errorData.error}`)
      }
      console.log(`[v0] [Manager] ✓ Toggle API succeeded`)
      
      // 2. Update local state immediately
      console.log(`[v0] [Manager] → Updating local state...`)
      updateActiveConnections(prev => prev.map(ac =>
        ac.connectionId === connectionId ? { ...ac, isActive: newState } : ac
      ))
      console.log(`[v0] [Manager] ✓ Local state updated`)

      // Live trade is now MANUAL ONLY - do not auto-enable
      // User must manually enable via the Live Trade slider on the connection card
      if (!newState) {
        // Only auto-disable live trade when connection is disabled
        console.log(`[v0] [Manager] → Stopping engine for ${connName} (connection disabled)...`)
        const stopRes = await fetch(`/api/settings/connections/${connectionId}/live-trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_live_trade: false }),
          cache: "no-store"
        })
        
        if (stopRes.ok) {
          console.log(`[v0] [Manager] ✓ Engine stopped for ${connName}`)
        }
        toast.success("Connection deactivated", {
          description: "Engine stopped",
        })
      } else {
        // When enabling, just show that live trade must be enabled manually
        toast.success("Connection added to Active Connections", {
          description: "Use the Live Trade slider to enable real exchange trading",
        })
      }

      // Dispatch event for other components
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("connection-toggled", {
          detail: { connectionId, newState }
        }))
        console.log(`[v0] [Manager] → Dispatched connection-toggled event`)
      }
      
      console.log(`[v0] [Manager] ✓ Toggle complete: ${connName} → ${newState ? "ACTIVE" : "INACTIVE"}`)
      
      // Refresh after toggle
      console.log(`[v0] [Manager] → Refreshing connections...`)
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

      {/* Quick Start Button - One-click setup for testing with BingX */}
      <QuickStartButton onQuickStartComplete={() => loadConnections()} />

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
