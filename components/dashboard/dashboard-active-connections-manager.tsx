"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, ChevronDown, Eye, EyeOff } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import type { Connection } from "@/lib/file-storage"
import { 
  loadActiveConnections, 
  removeActiveConnection, 
  toggleActiveConnection,
  type ActiveConnection 
} from "@/lib/active-connections"
import { Switch } from "@/components/ui/switch"
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface ActiveDashboardConnection extends ActiveConnection {
  details?: Connection
}

export function DashboardActiveConnectionsManager() {
  const [activeConnections, setActiveConnections] = useState<ActiveDashboardConnection[]>([])
  const [settingsConnections, setSettingsConnections] = useState<Record<string, Connection>>({})
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadConnections()
    const interval = setInterval(loadConnections, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadConnections = async () => {
    try {
      // Load active connections
      const active = loadActiveConnections()
      
      // Load settings connections
      const response = await fetch("/api/settings/connections")
      if (!response.ok) {
        console.error("[v0] Failed to load settings connections:", response.status)
        return
      }

      let data
      try {
        data = await response.json()
      } catch (parseError) {
        console.error("[v0] Failed to parse connections:", parseError)
        return
      }

      const connections = Array.isArray(data) ? data : (data?.connections || [])
      const connectionsMap = connections.reduce((acc: Record<string, Connection>, c: Connection) => {
        acc[c.id || ""] = c
        return acc
      }, {})

      // Enrich active connections with details
      const enriched = active.map(ac => ({
        ...ac,
        details: connectionsMap[ac.connectionId]
      }))

      setActiveConnections(enriched)
      setSettingsConnections(connectionsMap)
    } catch (error) {
      console.error("[v0] Error loading connections:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (connectionId: string, currentState: boolean) => {
    try {
      toggleActiveConnection(connectionId, !currentState)
      
      const updatedConnections = activeConnections.map(ac =>
        ac.connectionId === connectionId
          ? { ...ac, isActive: !currentState }
          : ac
      )
      setActiveConnections(updatedConnections)

      toast.success(
        !currentState ? "Connection enabled" : "Connection disabled",
        { description: `Connection status updated` }
      )
    } catch (error) {
      toast.error("Failed to update connection status")
    }
  }

  const handleRemove = (connectionId: string, connectionName: string) => {
    try {
      removeActiveConnection(connectionId)
      setActiveConnections(activeConnections.filter(ac => ac.connectionId !== connectionId))
      toast.success("Connection removed", {
        description: `${connectionName} has been removed from dashboard`
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
      {activeConnections.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p className="mb-3">No active connections</p>
            <p className="text-sm text-muted-foreground">Add connections from Settings to start monitoring them here.</p>
          </CardContent>
        </Card>
      ) : (
        activeConnections.map((conn) => {
          const details = conn.details
          const status = conn.isActive ? "active" : "disabled"
          const statusVariant = conn.isActive ? "default" : "secondary"

          return (
            <Collapsible
              key={conn.id}
              open={expandedId === conn.id}
              onOpenChange={(open) => setExpandedId(open ? conn.id : null)}
            >
              <Card className={conn.isActive ? "border-green-200 bg-green-50/30" : "border-slate-200 bg-slate-50/30"}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-8 h-8 p-0"
                        >
                          <ChevronDown className="h-4 w-4 transition-transform" />
                        </Button>
                      </CollapsibleTrigger>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm">
                            {details?.name || conn.connectionId}
                          </CardTitle>
                          <Badge variant={statusVariant} className="text-xs">
                            {status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {details?.exchange || conn.exchangeName}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">
                          {details?.api_type && `${details.api_type.replace(/_/g, " ")} • `}
                          {details?.connection_method || "unknown"}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 rounded bg-white">
                        {conn.isActive ? (
                          <Eye className="h-4 w-4 text-green-600" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-slate-400" />
                        )}
                        <Switch
                          checked={conn.isActive}
                          onCheckedChange={() =>
                            handleToggle(conn.connectionId, conn.isActive)
                          }
                          className="scale-90"
                        />
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Connection</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove "{details?.name || conn.connectionId}" from the dashboard? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="flex gap-2 justify-end">
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                handleRemove(
                                  conn.connectionId,
                                  details?.name || conn.connectionId
                                )
                              }
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Remove
                            </AlertDialogAction>
                          </div>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>

                <CollapsibleContent>
                  {details && (
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Exchange</div>
                          <div className="font-medium">{details.exchange}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">API Type</div>
                          <div className="font-medium capitalize">
                            {details.api_type?.replace(/_/g, " ")}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Connection Method</div>
                          <div className="font-medium capitalize">
                            {details.connection_method}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Mode</div>
                          <Badge
                            variant={
                              details.is_testnet ? "secondary" : "default"
                            }
                            className="text-xs"
                          >
                            {details.is_testnet ? "Testnet" : "Live"}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            Margin Type
                          </div>
                          <div className="font-medium capitalize">
                            {details.margin_type}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            Position Mode
                          </div>
                          <div className="font-medium capitalize">
                            {details.position_mode?.replace(/-/g, " ")}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )
        })
      )}
    </div>
  )
}
