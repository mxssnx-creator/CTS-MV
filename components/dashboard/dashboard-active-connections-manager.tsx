"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, AlertTriangle } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import type { Connection } from "@/lib/file-storage"
import { 
  loadActiveConnections, 
  removeActiveConnection, 
  toggleActiveConnection,
  type ActiveConnection 
} from "@/lib/active-connections"
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
      const active = await loadActiveConnections()
      
      // STICKY STATE: Never replace existing cards with empty data
      if (active.length === 0 && activeConnections.length > 0) {
        return
      }
      
      let connectionsMap: Record<string, Connection> = {}
      try {
        const response = await fetch("/api/settings/connections")
        if (response.ok) {
          const data = await response.json()
          const connections = Array.isArray(data) ? data : (data?.connections || [])
          connectionsMap = connections.reduce((acc: Record<string, Connection>, c: Connection) => {
            acc[c.id || ""] = c
            return acc
          }, {})
        }
      } catch {
        // Keep existing details if fetch fails
      }

      const enriched = active.map(ac => {
        // Preserve existing details if new fetch didn't return this connection
        const existingConn = activeConnections.find(e => e.connectionId === ac.connectionId)
        return {
          ...ac,
          details: connectionsMap[ac.connectionId] || existingConn?.details
        }
      })

      setActiveConnections(enriched)
    } catch (error) {
      console.error("[v0] Error loading connections:", error)
      // On error: keep existing state, never clear cards
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
    
    try {
      // 1. Toggle active state (independent from Settings base connections)
      await toggleActiveConnection(connectionId, newState)
      
      // 2. Update local state immediately for responsiveness
      setActiveConnections(prev => prev.map(ac =>
        ac.connectionId === connectionId ? { ...ac, isActive: newState } : ac
      ))

      // 3. Start or stop the trade engine for this connection
      if (newState) {
        // Enabling: Start the connection engine via live-trade endpoint
        const startRes = await fetch(`/api/settings/connections/${connectionId}/live-trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_live_trade: true }),
        })
        
        if (!startRes.ok) {
          const errorData = await startRes.json().catch(() => ({ error: "Unknown error" }))
          toast.warning("Connection enabled", {
            description: `Active but engine: ${errorData.error || "could not start"}`,
          })
        } else {
          toast.success("Connection activated", {
            description: "Engine starting - loading historical data...",
          })
        }
      } else {
        // Disabling: Stop the connection engine
        await fetch(`/api/settings/connections/${connectionId}/live-trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_live_trade: false }),
        })
        
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
    } catch (error) {
      console.error("[v0] Toggle error:", error)
      // Revert local state on error
      setActiveConnections(prev => prev.map(ac =>
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
      
      await removeActiveConnection(connectionId)
      setActiveConnections(activeConnections.filter(ac => ac.connectionId !== connectionId))
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
