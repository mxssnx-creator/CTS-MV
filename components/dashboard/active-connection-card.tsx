"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { ChevronDown, Eye, EyeOff, Trash2, Loader2 } from "lucide-react"
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
import type { Connection } from "@/lib/file-storage"
import type { ActiveConnection } from "@/lib/active-connections"

interface ProgressionData {
  phase: string
  progress: number
  message: string
  subPhase: string | null
  startedAt: string | null
  updatedAt: string | null
  details: {
    historicalDataLoaded: boolean
    indicationsCalculated: boolean
    strategiesProcessed: boolean
    liveProcessingActive: boolean
    liveTradingActive: boolean
  }
  error: string | null
}

const PHASE_LABELS: Record<string, string> = {
  disabled: "Disabled",
  idle: "Idle",
  initializing: "Initializing",
  prehistoric_data: "Loading Historical Data",
  indications: "Processing Indications",
  strategies: "Calculating Strategies",
  realtime: "Starting Real-time Processor",
  live_trading: "Live Trading Active",
  stopped: "Stopped",
  error: "Error",
}

const PHASE_COLORS: Record<string, string> = {
  disabled: "bg-muted",
  idle: "bg-muted",
  initializing: "bg-blue-500",
  prehistoric_data: "bg-amber-500",
  indications: "bg-orange-500",
  strategies: "bg-purple-500",
  realtime: "bg-cyan-500",
  live_trading: "bg-green-500",
  stopped: "bg-muted",
  error: "bg-red-500",
}

interface ActiveConnectionCardProps {
  connection: ActiveConnection & { details?: Connection }
  expanded: boolean
  onExpand: (expanded: boolean) => void
  onToggle: (connectionId: string, currentState: boolean) => Promise<void>
  onRemove: (connectionId: string, name: string) => Promise<void>
  isToggling: boolean
  globalEngineRunning: boolean
}

export function ActiveConnectionCard({
  connection,
  expanded,
  onExpand,
  onToggle,
  onRemove,
  isToggling,
  globalEngineRunning,
}: ActiveConnectionCardProps) {
  const [progression, setProgression] = useState<ProgressionData | null>(null)
  const details = connection.details

  // Poll progression when connection is active or transitioning
  const fetchProgression = useCallback(async () => {
    try {
      const res = await fetch(`/api/connections/progression/${connection.connectionId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.progression) {
          setProgression(data.progression)
        }
      }
    } catch {
      // Silently fail - will retry on next poll
    }
  }, [connection.connectionId])

  useEffect(() => {
    fetchProgression()
    // Poll faster when engine is active/transitioning, slower when idle
    const interval = setInterval(fetchProgression, 
      progression?.phase && progression.phase !== "idle" && progression.phase !== "stopped" && progression.phase !== "live_trading"
        ? 1000 
        : 5000
    )
    return () => clearInterval(interval)
  }, [fetchProgression, progression?.phase])

  const phase = progression?.phase || "idle"
  const progress = progression?.progress || 0
  const isRunning = phase === "live_trading"
  const isStarting = phase !== "idle" && phase !== "stopped" && phase !== "live_trading" && phase !== "error" && progress < 100
  const hasError = phase === "error"

  const cardBorderClass = isRunning
    ? "border-green-300 dark:border-green-800"
    : isStarting
      ? "border-amber-300 dark:border-amber-800"
      : hasError
        ? "border-red-300 dark:border-red-800"
        : "border-border"

  const statusBadge = isRunning
    ? { label: "Live", variant: "default" as const, className: "bg-green-600 text-white" }
    : isStarting
      ? { label: "Starting...", variant: "secondary" as const, className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" }
      : connection.isActive
        ? { label: "Enabled", variant: "secondary" as const, className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" }
        : { label: "Disabled", variant: "secondary" as const, className: "text-muted-foreground" }

  return (
    <Collapsible open={expanded} onOpenChange={onExpand}>
      <Card className={`transition-colors ${cardBorderClass}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-sm truncate">
                    {details?.name || connection.connectionId}
                  </CardTitle>
                  <Badge variant={statusBadge.variant} className={`text-xs ${statusBadge.className}`}>
                    {statusBadge.label}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {details?.exchange || connection.exchangeName}
                  </Badge>
                </div>
                <CardDescription className="text-xs mt-0.5">
                  {details?.api_type && `${details.api_type.replace(/_/g, " ")} `}
                  {details?.connection_method && `/ ${details.connection_method}`}
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50">
                {isToggling ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : connection.isActive ? (
                  <Eye className="h-4 w-4 text-green-600" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
                <Switch
                  checked={connection.isActive}
                  onCheckedChange={() => onToggle(connection.connectionId, connection.isActive)}
                  disabled={isToggling || (!globalEngineRunning && !connection.isActive)}
                  className="scale-90"
                  title={!globalEngineRunning && !connection.isActive ? "Start Global Trade Engine first" : undefined}
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
                    <AlertDialogTitle>Remove from Active List</AlertDialogTitle>
                    <AlertDialogDescription>
                      {`Remove "${details?.name || connection.connectionId}" from active connections? The engine will be stopped.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="flex gap-2 justify-end">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onRemove(connection.connectionId, details?.name || connection.connectionId)}
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

        {/* Progress bar - shown when engine is active, starting, or has error */}
        {connection.isActive && phase !== "idle" && phase !== "stopped" && (
          <CardContent className="pt-0 pb-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  {PHASE_LABELS[phase] || phase}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {progress}%
                </span>
              </div>
              <Progress 
                value={progress} 
                className="h-2"
              />
              {progression?.message && (
                <p className="text-xs text-muted-foreground truncate">
                  {progression.message}
                  {progression.subPhase && (
                    <span className="ml-1">
                      - {progression.subPhase}
                    </span>
                  )}
                </p>
              )}
            </div>
          </CardContent>
        )}

        <CollapsibleContent>
          {details && (
            <CardContent className="pt-0 pb-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">Exchange</div>
                  <div className="font-medium">{details.exchange}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">API Type</div>
                  <div className="font-medium capitalize">{details.api_type?.replace(/_/g, " ")}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">Connection Method</div>
                  <div className="font-medium capitalize">{details.connection_method}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">Mode</div>
                  <Badge variant={details.is_testnet ? "secondary" : "default"} className="text-xs">
                    {details.is_testnet ? "Testnet" : "Live"}
                  </Badge>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">Margin Type</div>
                  <div className="font-medium capitalize">{details.margin_type}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">Position Mode</div>
                  <div className="font-medium capitalize">{details.position_mode?.replace(/-/g, " ")}</div>
                </div>
              </div>

              {/* Progression details when expanded */}
              {progression && phase !== "idle" && phase !== "stopped" && phase !== "disabled" && (
                <div className="mt-4 pt-3 border-t">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Engine Progression</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Current Phase</div>
                      <div className="font-medium">{PHASE_LABELS[phase] || phase}</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Overall Progress</div>
                      <div className="font-medium tabular-nums">{progress}%</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Historical Data</div>
                      <Badge variant={progression.details?.historicalDataLoaded ? "default" : "secondary"} className="text-xs">
                        {progression.details?.historicalDataLoaded ? "Loaded" : "Pending"}
                      </Badge>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Indications</div>
                      <Badge variant={progression.details?.indicationsCalculated ? "default" : "secondary"} className="text-xs">
                        {progression.details?.indicationsCalculated ? "Calculated" : "Pending"}
                      </Badge>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Strategies</div>
                      <Badge variant={progression.details?.strategiesProcessed ? "default" : "secondary"} className="text-xs">
                        {progression.details?.strategiesProcessed ? "Processed" : "Pending"}
                      </Badge>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Live Processing</div>
                      <Badge variant={progression.details?.liveProcessingActive ? "default" : "secondary"} className="text-xs">
                        {progression.details?.liveProcessingActive ? "Active" : "Pending"}
                      </Badge>
                    </div>
                    {progression.error && (
                      <div className="col-span-2 space-y-0.5">
                        <div className="text-xs text-red-500 font-medium">Error: {progression.error}</div>
                      </div>
                    )}
                    {progression.updatedAt && (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">Last Update</div>
                        <div className="font-medium text-xs">{new Date(progression.updatedAt).toLocaleTimeString()}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
