"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import type { Connection } from "@/lib/file-storage"
import { addActiveConnection, loadActiveConnections } from "@/lib/active-connections"

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
      console.log("[v0] [AddDialog] Loading enabled base connections from Settings...")
      // Load ENABLED connections from settings (is_enabled=true for trade engine)
      const response = await fetch("/api/settings/connections?enabled=true")
      if (!response.ok) {
        console.error("[v0] Failed to load connections:", response.status)
        return
      }

      let data
      try {
        data = await response.json()
      } catch (parseError) {
        console.error("[v0] Failed to parse connections response:", parseError)
        return
      }

      const connections = Array.isArray(data) ? data : (data?.connections || [])
      console.log("[v0] [AddDialog] Loaded", connections.length, "enabled connections from Settings")
      setEnabledConnections(connections)

      // Load currently active connections from dashboard
      try {
        const activeConns = await loadActiveConnections()
        setActiveConnections(activeConns)
        console.log("[v0] [AddDialog] Found", activeConns.length, "connections already on dashboard")
      } catch (e) {
        console.log("[v0] Could not load active connections:", e)
      }

      // Set first enabled connection as default
      if (connections.length > 0 && !selectedConnection) {
        setSelectedConnection(connections[0].id || "")
        console.log("[v0] [AddDialog] Auto-selected first connection:", connections[0].name)
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
      
      console.log("[v0] New connection added to dashboard disabled by default:", selectedConnection)
      
      toast.success("Connection added to dashboard", {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Connection to Dashboard</DialogTitle>
          <DialogDescription>
            Select an enabled connection from Settings to add to the active connections panel. The toggle button below is separate and only controls whether the trade engine is active for that connection.
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
              {/* Show Inserted Connections on Dashboard */}
              {activeConnections.length > 0 && (
                <div className="space-y-2">
                  <Label className="font-medium text-sm">Already on Dashboard</Label>
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
                              <Badge variant="outline" className="text-xs bg-green-50">
                                Inserted
                              </Badge>
                              <Badge variant={ac.isActive ? "default" : "secondary"} className="text-xs">
                                Toggle: {ac.isActive ? "On" : "Off"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-blue-700 mt-3">
                        <strong>Inserted:</strong> Connection is added to dashboard (separate from toggle state)
                        <br />
                        <strong>Toggle:</strong> Controls if trade engine is active for this connection
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {enabledConnections.length === 0 ? (
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardContent className="pt-6 flex gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                    <div className="text-sm text-amber-800">
                      <p className="font-semibold mb-1">No Enabled Connections</p>
                      <p className="text-xs">You need to enable connections in Settings first (is_enabled = true).</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="connection-select" className="font-medium">
                      Select Enabled Connection
                    </Label>
                    <Select value={selectedConnection} onValueChange={setSelectedConnection} disabled={adding}>
                      <SelectTrigger id="connection-select" className="bg-white">
                        <SelectValue placeholder="Choose a connection..." />
                      </SelectTrigger>
                      <SelectContent>
                        {enabledConnections.map((conn) => (
                          <SelectItem key={conn.id} value={conn.id || ""}>
                            <div className="flex items-center gap-2">
                              <span>{conn.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {conn.exchange}
                              </Badge>
                              {isAlreadyActive && selectedConnection === conn.id && (
                                <Badge variant="outline" className="text-xs bg-green-50">
                                  Already Added
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedConn && (
                    <Card className="bg-slate-50 border-slate-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{selectedConn.name}</CardTitle>
                        <CardDescription className="text-xs">{selectedConn.exchange}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="text-muted-foreground">API Type</div>
                            <div className="font-medium capitalize">{selectedConn.api_type?.replace(/_/g, " ")}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Connection</div>
                            <div className="font-medium capitalize">{selectedConn.connection_method}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Mode</div>
                            <Badge variant={selectedConn.is_testnet ? "secondary" : "default"} className="text-xs">
                              {selectedConn.is_testnet ? "Testnet" : "Live"}
                            </Badge>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Status</div>
                            {isAlreadyActive ? (
                              <Badge className="text-xs bg-green-600">Already Added</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Not on Dashboard
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="border-blue-200 bg-blue-50/50">
                    <CardContent className="pt-4 text-xs">
                      <p className="text-blue-900 font-semibold mb-2">Important:</p>
                      <ul className="text-blue-800 space-y-1">
                        <li>• <strong>Inserted</strong> = Connection added to dashboard (permanent until removed)</li>
                        <li>• <strong>Toggle</strong> = Separate control for activating trade engine</li>
                        <li>• You can add a connection and keep its toggle off</li>
                        <li>• Toggle on/off independently from the dashboard panel</li>
                      </ul>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={adding || loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!selectedConnection || isAlreadyActive || adding || loading}
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Connection"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
