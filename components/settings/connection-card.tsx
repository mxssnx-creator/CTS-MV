"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Power, Trash2, Settings, ChevronDown, Loader2, AlertCircle, CheckCircle2, Edit2 } from "lucide-react"
import { useState } from "react"
import { toast } from "@/lib/simple-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ExchangeConnection } from "@/lib/types"

interface ConnectionCardProps {
  connection: ExchangeConnection
  onToggle: () => void
  onActivate: () => void
  onDelete: () => void
  onEdit?: (settings: Partial<ExchangeConnection>) => void
  onShowDetails?: () => void
  onShowLogs?: () => void
  onTestConnection?: (logs: string[]) => void
}

export function ConnectionCard({
  connection,
  onToggle,
  onActivate,
  onDelete,
  onEdit,
  onShowDetails,
  onShowLogs,
  onTestConnection,
}: ConnectionCardProps) {
  const [testingConnection, setTestingConnection] = useState(false)
  const [logsExpanded, setLogsExpanded] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({
    api_key: connection.api_key,
    api_secret: connection.api_secret,
    name: connection.name,
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [workingStatus, setWorkingStatus] = useState<"idle" | "testing" | "success" | "error">("idle")
  const [showTestLogInstant, setShowTestLogInstant] = useState(false)

  // Auto-run test on mount if credentials configured and not recently tested
  useState(() => {
    const shouldAutoTest = connection.is_enabled && 
      connection.api_key && 
      connection.api_secret && 
      (!connection.last_test_at || 
        (Date.now() - new Date(connection.last_test_at).getTime() > 5 * 60 * 1000)) // 5 minutes
    
    if (shouldAutoTest) {
      console.log("[v0] Auto-testing connection:", connection.name)
      handleTestConnection()
    }
  })

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setWorkingStatus("testing")
    setShowTestLogInstant(true)

    console.log("[v0] [Test Connection] Using configured settings from connection:", {
      exchange: connection.exchange,
      api_type: connection.api_type,
      connection_method: connection.connection_method,
      connection_library: connection.connection_library,
      is_testnet: connection.is_testnet,
    })

    try {
      const response = await fetch("/api/settings/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: connection.exchange,
          api_type: connection.api_type || "futures",
          connection_method: connection.connection_method || "rest",
          connection_library: connection.connection_library || "native",
          api_key: connection.api_key || "",
          api_secret: connection.api_secret || "",
          api_passphrase: connection.api_passphrase || "",
          is_testnet: connection.is_testnet || false,
        }),
      })

      const data = await response.json()

      if (data.error) {
        setWorkingStatus("error")
        toast.error("Connection Test Failed", {
          description: data.error || "Failed to test connection",
        })
        onTestConnection?.(data.log || [])
        return
      }

      if (!response.ok || !data.success) {
        setWorkingStatus("error")
        toast.error("Connection Test Failed", {
          description: data.error || data.message || "Failed to test connection",
        })
        onTestConnection?.(data.log || [])
        return
      }

      setWorkingStatus("success")
      toast.success("Connection Test Successful", {
        description: `Balance: ${data.balance?.toFixed(2) || "N/A"} USDT`,
      })
      onTestConnection?.(data.log || [])
    } catch (error) {
      setWorkingStatus("error")
      toast.error("Test Connection Error", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!editFormData.api_key || !editFormData.api_secret) {
      toast.error("Validation Error", {
        description: "API key and secret are required",
      })
      return
    }

    setSavingSettings(true)
    try {
      const response = await fetch(`/api/settings/connections/${connection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: editFormData.api_key,
          api_secret: editFormData.api_secret,
          name: editFormData.name,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update connection settings")
      }

      toast.success("Settings Updated", {
        description: "Connection settings have been saved successfully",
      })

      onEdit?.(editFormData)
      setEditDialogOpen(false)
    } catch (error) {
      toast.error("Update Failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "success":
        return "bg-green-50 border-green-200 text-green-900"
      case "failed":
        return "bg-red-50 border-red-200 text-red-900"
      case "warning":
        return "bg-yellow-50 border-yellow-200 text-yellow-900"
      default:
        return "bg-gray-50 border-gray-200 text-gray-900"
    }
  }

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />
      default:
        return null
    }
  }

  const credentialsConfigured =
    connection.api_key && connection.api_key !== "" && !connection.api_key.includes("PLACEHOLDER")

  return (
    <>
      <Card className="border border-border p-6">
        {/* Main Content - Horizontal Layout */}
        <div className="space-y-4">
          {/* Header Row */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-bold text-base">{connection.name}</h3>
                <Badge variant="secondary" className="text-xs">
                  {connection.exchange.toUpperCase()}
                </Badge>
                {connection.is_testnet && (
                  <Badge className="text-xs bg-blue-100 text-blue-900">Testnet</Badge>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">
                  API Type: <span className="text-foreground font-medium">{connection.api_type}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Margin: <span className="text-foreground font-medium">{connection.margin_type}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditDialogOpen(true)}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                <span>API Settings</span>
              </Button>
              <div className="flex items-center justify-end gap-3">
                <span className="text-sm text-muted-foreground">
                  {connection.is_enabled ? "Enabled" : "Disabled"}
                </span>
                <Button
                  size="sm"
                  variant={connection.is_enabled ? "default" : "outline"}
                  onClick={onToggle}
                  className="w-14"
                  title={connection.is_enabled ? "Disable" : "Enable"}
                >
                  <Power className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Info Row */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Method: </span>
              <span className="font-medium">{connection.connection_method}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Position: </span>
              <span className="font-medium">{connection.position_mode}</span>
            </div>
          </div>

          {/* Credentials Warning */}
          {!credentialsConfigured && (
            <div className="text-xs p-3 bg-yellow-50 text-yellow-800 rounded border border-yellow-200">
              API credentials not configured. Please add your API key and secret to test this connection.
            </div>
          )}

          {/* Test Result */}
          {connection.last_test_status && (
            <div className={`p-3 rounded border flex items-start gap-3 ${getStatusColor(connection.last_test_status)}`}>
              <div className="flex-shrink-0 mt-0.5">{getStatusIcon(connection.last_test_status)}</div>
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {connection.last_test_status === "success" ? "Connection Active" : "Connection Failed"}
                </div>
                {connection.last_test_balance !== undefined && (
                  <div className="text-xs mt-1">Balance: ${connection.last_test_balance.toFixed(2)} USDT</div>
                )}
                {connection.last_test_at && (
                  <div className="text-xs mt-1">
                    Last tested: {new Date(connection.last_test_at).toLocaleDateString()} at{" "}
                    {new Date(connection.last_test_at).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestConnection}
              disabled={!credentialsConfigured || testingConnection}
              className="flex items-center gap-2"
            >
              {testingConnection ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <span>Test Connection</span>
                </>
              )}
            </Button>

            <div className="flex items-center gap-2">
              {(showTestLogInstant || (connection.last_test_log && connection.last_test_log.length > 0)) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLogsExpanded(!logsExpanded)}
                  className="text-muted-foreground"
                  title="View Test Logs"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${logsExpanded ? "rotate-180" : ""}`} />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete ${connection.name}? This action cannot be undone.`)) {
                    onDelete()
                  }
                }}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Logs Section */}
          {connection.last_test_log && connection.last_test_log.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs justify-between text-left"
                onClick={() => setLogsExpanded(!logsExpanded)}
              >
                <span>Test Logs</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${logsExpanded ? "rotate-180" : ""}`} />
              </Button>
              {logsExpanded && (
                <div className="bg-muted p-3 rounded text-xs font-mono max-h-48 overflow-y-auto space-y-0.5 border">
                  {(Array.isArray(connection.last_test_log) ? connection.last_test_log : []).map((line, i) => (
                    <div key={i} className="text-muted-foreground">
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Edit Settings Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Connection Settings</DialogTitle>
            <DialogDescription>Update API credentials and connection name for {connection.name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Connection Name</Label>
              <Input
                id="name"
                value={editFormData.name}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., My Bybit Connection"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                value={editFormData.api_key}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, api_key: e.target.value }))}
                placeholder="Enter your API key"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-secret">API Secret</Label>
              <Input
                id="api-secret"
                type="password"
                value={editFormData.api_secret}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, api_secret: e.target.value }))}
                placeholder="Enter your API secret"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-900">
              ℹ️ Your API credentials are encrypted and only used for secure connections to {connection.exchange}.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
