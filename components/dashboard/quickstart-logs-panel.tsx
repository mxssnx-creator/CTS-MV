"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, RefreshCw, Copy, Download } from "lucide-react"
import { toast } from "@/lib/simple-toast"

interface ProgressionLogEntry {
  timestamp: string
  level: "info" | "warning" | "error" | "debug"
  phase: string
  message: string
  details?: Record<string, any>
  connectionId: string
}

interface QuickstartLogsPanelProps {
  connectionId?: string
  className?: string
}

interface ProgressionState {
  cyclesCompleted: number
  successfulCycles: number
  failedCycles: number
  cycleSuccessRate: number
  totalTrades: number
}

export function QuickstartLogsPanel({ connectionId, className = "" }: QuickstartLogsPanelProps) {
  const [logs, setLogs] = useState<ProgressionLogEntry[]>([])
  const [progressionState, setProgressionState] = useState<ProgressionState | null>(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchLogs = async () => {
    if (!connectionId) return

    setLoading(true)
    try {
      const res = await fetch(`/api/connections/progression/${connectionId}/logs`)
      const data = await res.json()

      if (data.logs) {
        setLogs(data.logs)
      }
      if (data.progressionState) {
        setProgressionState(data.progressionState)
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()

    // Auto-refresh if enabled
    if (autoRefresh && connectionId) {
      const interval = setInterval(fetchLogs, 2000)
      return () => clearInterval(interval)
    }
  }, [connectionId, autoRefresh])

  const copyLogs = () => {
    const logText = logs
      .map((log) => `[${log.timestamp}] ${log.level.toUpperCase()} [${log.phase}] ${log.message}`)
      .join("\n")
    navigator.clipboard.writeText(logText)
    toast.success("Logs copied to clipboard")
  }

  const downloadLogs = () => {
    const logText = logs
      .map((log) => `[${log.timestamp}] ${log.level.toUpperCase()} [${log.phase}] ${log.message}`)
      .join("\n")
    const blob = new Blob([logText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `progression-logs-${connectionId}.txt`
    a.click()
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "bg-red-100 text-red-800"
      case "warning":
        return "bg-yellow-100 text-yellow-800"
      case "info":
        return "bg-blue-100 text-blue-800"
      case "debug":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  if (!connectionId) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm">Progression Logs</CardTitle>
          <CardDescription>Select a connection to view logs</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Progression Logs</CardTitle>
            <CardDescription>{logs.length} log entries</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={copyLogs} disabled={logs.length === 0}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={downloadLogs} disabled={logs.length === 0}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* Progression State Summary */}
        {progressionState && progressionState.cyclesCompleted > 0 && (
          <div className="grid grid-cols-4 gap-2 p-2 bg-muted rounded-lg text-xs mb-2">
            <div className="text-center">
              <div className="font-semibold">{progressionState.cyclesCompleted}</div>
              <div className="text-muted-foreground">Cycles</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-green-600">{progressionState.successfulCycles}</div>
              <div className="text-muted-foreground">Success</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-red-600">{progressionState.failedCycles}</div>
              <div className="text-muted-foreground">Failed</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{(progressionState.cycleSuccessRate || 0).toFixed(1)}%</div>
              <div className="text-muted-foreground">Rate</div>
            </div>
          </div>
        )}
        
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">No logs yet</div>
        ) : (
          <ScrollArea className="h-[300px] w-full border rounded-md p-3 bg-muted/50">
            <div className="space-y-2">
              {logs.map((log, idx) => (
                <div key={idx} className="text-xs font-mono">
                  <div className="flex items-start gap-2">
                    <Badge className={`flex-shrink-0 mt-0.5 ${getLevelColor(log.level)}`}>
                      {log.level}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</div>
                      <div className="text-foreground break-words">[{log.phase}] {log.message}</div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="text-muted-foreground mt-1 break-words">
                          {JSON.stringify(log.details, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex items-center gap-2 pt-2 border-t">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh every 2s
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
