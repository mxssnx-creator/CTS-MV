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
import { addActiveConnection } from "@/lib/active-connections"

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
  onSuccess,
}: AddActiveConnectionDialogProps) {
  const [selectedConnection, setSelectedConnection] = useState<string>("")
  const [availableConnections, setAvailableConnections] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (open) {
      loadConnections()
    }
  }, [open])

  const loadConnections = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/settings/connections", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
      if (!response.ok) {
        toast.error("Failed to load connections")
        return
      }

      const data = await response.json()
      const allConnections = Array.isArray(data) ? data : (data?.connections || [])

      // Filter to ONLY show connections that are:
      // 1. NOT predefined (inserted connections only)
      // 2. Enabled (is_enabled = true)
      // 3. Have valid credentials (not placeholders)
      // 4. NOT already active in dashboard (is_enabled_dashboard = false)
      const availableForAdd = allConnections.filter((c: any) => {
        const isPredefined = c.is_predefined === true || c.is_predefined === "1"
        const isEnabled = c.is_enabled === true || c.is_enabled === "1"
        const hasValidCredentials = c.api_key && c.api_key.length > 20 && !c.api_key.includes("PLACEHOLDER")
        const notAlreadyActive = !(c.is_enabled_dashboard === true || c.is_enabled_dashboard === "1")
        
        return !isPredefined && isEnabled && hasValidCredentials && notAlreadyActive
      })

      setAvailableConnections(availableForAdd)

      if (availableForAdd.length > 0 && !selectedConnection) {
        setSelectedConnection(availableForAdd[0].id || "")
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

    const connection = availableConnections.find((c: any) => c.id === selectedConnection)
    if (!connection) {
      toast.error("Connection not found")
      return
    }

    setAdding(true)
    try {
      // Use the active-connections library function instead of API endpoint
      await addActiveConnection(selectedConnection, connection.exchange)

      toast.success(`${connection.name} added to active list`)

      if (onConnectionAdded) {
        await onConnectionAdded(selectedConnection)
      }
      if (onSuccess) {
        onSuccess(selectedConnection)
      }

      onOpenChange(false)
      setSelectedConnection("")
    } catch (error: any) {
      console.error("[v0] Error adding connection:", error)
      toast.error(error.message || "Failed to add connection")
    } finally {
      setAdding(false)
    }
  }

  const selectedConn = availableConnections.find((c: any) => c.id === selectedConnection)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Connection to Active List</DialogTitle>
          <DialogDescription>
            Select an inserted and enabled connection with valid credentials to add to your active trading dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading connections...
            </div>
          ) : availableConnections.length > 0 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="connection-select" className="font-medium text-sm">
                  Available Connections (Inserted & Enabled)
                </Label>
                <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                  <SelectTrigger id="connection-select">
                    <SelectValue placeholder="Select a connection..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableConnections.map((conn: any) => (
                      <SelectItem key={conn.id} value={conn.id || ""}>
                        {conn.name} ({conn.exchange})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedConn && (
                <Card className="border-green-200 bg-green-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Connection Details</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <div><strong>Name:</strong> {selectedConn.name}</div>
                    <div><strong>Exchange:</strong> {selectedConn.exchange}</div>
                    <div><strong>API Type:</strong> {selectedConn.api_type || "perpetual_futures"}</div>
                    <div><strong>Test Status:</strong> {selectedConn.last_test_status === "success" ? "✓ Passed" : "— Not tested"}</div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="pt-4 text-xs">
                  <p className="text-blue-900 font-semibold mb-2">About Active List:</p>
                  <ul className="text-blue-800 space-y-1">
                    <li>• Added in inactive state (toggle off)</li>
                    <li>• Enable Live Trade toggle to start Main Engine</li>
                    <li>• Enable Preset Trade toggle to start Preset Engine</li>
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="pt-4">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">No Available Connections</p>
                    <p className="text-xs">
                      Only inserted connections (not predefined templates) that are enabled with valid credentials can be added.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!selectedConnection || adding || availableConnections.length === 0}
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
