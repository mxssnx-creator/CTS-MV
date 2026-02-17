"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import type { Connection } from "@/lib/redis-db"

interface AddActiveConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnectionAdded?: (connectionId?: string) => Promise<void> | void
  onSuccess?: (connectionId?: string) => void
}

export function AddActiveConnectionDialog({ 
  open, 
  onOpenChange, 
  onConnectionAdded, 
  onSuccess 
}: AddActiveConnectionDialogProps) {
  const [selectedConnection, setSelectedConnection] = useState<string>("")
  const [enabledConnections, setEnabledConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [activeConnections, setActiveConnections] = useState<any[]>([])

  useEffect(() => {
    if (open) {
      loadConnections()
    }
  }, [open])

  const loadConnections = async () => {
    setLoading(true)
    try {
      console.log("[v0] [AddDialog] Loading enabled connections from Settings...")
      // Load ALL connections first to check which have real credentials
      const response = await fetch("/api/settings/connections", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
      if (!response.ok) {
        console.error("[v0] Failed to load connections:", response.status)
        toast.error("Failed to load connections")
        return
      }

      const data = await response.json()
      const allConnections = data.connections || []
      
      // Filter to ONLY show connections that are BOTH:
      // 1. Enabled (is_enabled = true for trade engine capability)
      // 2. Have REAL credentials (not placeholders, actually configured in Settings)
      const configuredConnections = allConnections.filter((c: any) => {
        const isEnabled = c.is_enabled === "1" || c.is_enabled === true
        const hasRealCredentials = c.api_key && c.api_key.length > 0 && !c.api_key.includes("PLACEHOLDER")
        const notAlreadyActive = !c.is_enabled_dashboard
        
        console.log(`[v0] [AddDialog] Checking ${c.name}: enabled=${isEnabled}, hasCreds=${hasRealCredentials}, notActive=${notAlreadyActive}`)
        return isEnabled && hasRealCredentials && notAlreadyActive
      })
      
      console.log("[v0] [AddDialog] Filtered to", configuredConnections.length, "configured connections with real credentials")
      setEnabledConnections(configuredConnections)

      // Set first enabled connection as default
      if (configuredConnections.length > 0 && !selectedConnection) {
        setSelectedConnection(configuredConnections[0].id || "")
        console.log("[v0] [AddDialog] Auto-selected first connection:", configuredConnections[0].name)
      }
    } catch (error) {
      console.error("[v0] Error loading connections:", error)
      toast.error("Failed to load connections")
    } finally {
      setLoading(false)
    }
  }

      const data = await response.json()
      const connections = data.connections || []
      console.log("[v0] [AddDialog] Loaded", connections.length, "enabled connections from Settings")
      
      // Filter to show only connections that have real credentials (inserted from Settings)
      const configuredConnections = connections.filter((c: any) => {
        const hasRealCredentials = c.api_key && c.api_key.length > 0 && !c.api_key.includes("PLACEHOLDER")
        return hasRealCredentials
      })
      
      console.log("[v0] [AddDialog] Filtered to", configuredConnections.length, "configured connections with credentials")
      setEnabledConnections(configuredConnections)

      // Load currently active connections from dashboard
      try {
        const activeConns = await loadActiveConnections()
        setActiveConnections(activeConns || [])
        console.log("[v0] [AddDialog] Found", activeConns?.length || 0, "connections already on active list")
      } catch (e) {
        console.log("[v0] Could not load active connections:", e)
        setActiveConnections([])
      }

      // Set first enabled connection as default
      if (configuredConnections.length > 0 && !selectedConnection) {
        setSelectedConnection(configuredConnections[0].id || "")
        console.log("[v0] [AddDialog] Auto-selected first connection:", configuredConnections[0].name)
      }
    } catch (error) {
      console.error("[v0] Error loading connections:", error)
      toast.error("Failed to load connections")
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!selectedConnection) {
      toast.error("Please select a connection")
      return
    }

    const connection = enabledConnections.find(c => c.id === selectedConnection)
    if (!connection) {
      toast.error("Connection not found")
      return
    }

    setAdding(true)
    try {
      // Add to active connections via Redis - disabled by default
      await addActiveConnection(selectedConnection, connection.exchange)
      
      console.log("[v0] New connection added to active list disabled by default:", selectedConnection)
      
      toast.success("Connection added to active list", {
        description: `${connection.name} (${connection.exchange}) added with toggle off. Enable the toggle to start trading.`
      })

      if (onConnectionAdded) {
        await onConnectionAdded(selectedConnection)
      }
      if (onSuccess) {
        onSuccess(selectedConnection)
      }

      onOpenChange(false)
      setSelectedConnection("")
    } catch (error) {
      console.error("[v0] Error adding connection:", error)
      toast.error("Failed to add connection")
    } finally {
      setAdding(false)
    }
  }

  const selectedConn = enabledConnections.find(c => c.id === selectedConnection)
  const isAlreadyActive = selectedConnection && activeConnections.some(ac => ac.connectionId === selectedConnection)
  const availableConnections = enabledConnections.filter(c => !activeConnections.some(ac => ac.connectionId === c.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Connection to Active List</DialogTitle>
          <DialogDescription>
            Select an enabled connection from Settings that has valid credentials configured. These connections are available to add to your active trading list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading connections...
            </div>
          ) : (
            <>
              {/* Show Already Active Connections */}
              {activeConnections.length > 0 && (
                <div className="space-y-2">
                  <Label className="font-medium text-sm">Already Active</Label>
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-1 gap-2">
                        {activeConnections.map((ac) => (
                          <div key={ac.id} className="flex items-center justify-between p-2 bg-white border border-blue-100 rounded">
                            <div className="flex-1 text-sm">
                              <div className="font-medium">{ac.exchangeName}</div>
                              <div className="text-xs text-muted-foreground">ID: {ac.connectionId}</div>
                            </div>
                            <div className="flex gap-2">
                              <Badge 
                                variant="outline"
                                className="text-xs bg-green-50"
                              >
                                Active
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Show Available Enabled Connections */}
              {availableConnections.length > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="connection-select" className="font-medium text-sm">
                    Available Enabled Connections
                  </Label>
                  <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                    <SelectTrigger id="connection-select">
                      <SelectValue placeholder="Select a connection..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableConnections.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id || ""}>
                          {conn.name} ({conn.exchange}) - {conn.is_enabled ? "Enabled" : "Disabled"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Card className="border-yellow-200 bg-yellow-50">
                  <CardContent className="pt-4">
                    <div className="flex gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-yellow-800">
                        <p className="font-medium mb-1">No Available Connections</p>
                        <p className="text-xs">All enabled connections from Settings are already on the active list, or there are no enabled connections. Go to Settings to enable more connections.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Show Selected Connection Details */}
              {selectedConn && !isAlreadyActive && (
                <Card className="border-green-200 bg-green-50/50">
                  <CardHeader>
                    <CardTitle className="text-sm">Connection Details</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <div>
                      <strong>Name:</strong> {selectedConn.name}
                    </div>
                    <div>
                      <strong>Exchange:</strong> {selectedConn.exchange}
                    </div>
                    <div>
                      <strong>Status:</strong> {selectedConn.is_enabled ? "✓ Enabled in Settings" : "✗ Disabled"}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Info Card */}
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="pt-4 text-xs">
                  <p className="text-blue-900 font-semibold mb-2">About Active List:</p>
                  <ul className="text-blue-800 space-y-1">
                    <li>• Must be enabled in Settings (is_enabled = true)</li>
                    <li>• Added in inactive state (toggle off)</li>
                    <li>• Toggle controls trade engine independently from Settings</li>
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleAdd}
            disabled={!selectedConnection || adding || isAlreadyActive}
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              "Add to Active List"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
