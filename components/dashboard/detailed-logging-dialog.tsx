"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FileText, ChevronDown, ChevronRight, Activity, TrendingUp, Database, Clock, RefreshCw } from "lucide-react"

interface LogEntry {
  id: string
  timestamp: string
  type: "indication" | "strategy" | "position" | "engine" | "error"
  symbol?: string
  phase?: string
  message: string
  details?: {
    timeframe?: string
    timeRange?: string
    calculatedIndicators?: number
    evaluatedStrategies?: number
    pseudoPositions?: {
      base: number
      main: number
      real: number
    }
    configs?: number
    evals?: number
    ratios?: {
      last25: number
      last50: number
      maxPos: number
    }
    cycleDuration?: number
    cycleCount?: number
  }
  expanded?: boolean
}

interface ProgressSummary {
  symbolsActive: number
  indicationCycles: number
  strategyCycles: number
  totalIndicationsCalculated: number
  totalStrategiesEvaluated: number
  pseudoPositions: {
    base: number
    main: number
    real: number
    total: number
  }
  configsProcessed: number
  evalsCompleted: number
  avgCycleDuration: number
  lastUpdate: string
  errors: number
  warnings: number
}

export function DetailedLoggingDialog() {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [summary, setSummary] = useState<ProgressSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string>("all")

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch("/api/trade-engine/detailed-logs", { cache: "no-store" })
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs || [])
        setSummary(data.summary || null)
      }
    } catch (error) {
      console.error("[v0] Error fetching detailed logs:", error)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchLogs()
      const interval = setInterval(fetchLogs, 5000)
      return () => clearInterval(interval)
    }
  }, [open, fetchLogs])

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const filteredLogs = filter === "all" ? logs : logs.filter(log => log.type === filter)

  const getTypeColor = (type: string) => {
    switch (type) {
      case "indication": return "bg-blue-100 text-blue-800"
      case "strategy": return "bg-purple-100 text-purple-800"
      case "position": return "bg-green-100 text-green-800"
      case "engine": return "bg-orange-100 text-orange-800"
      case "error": return "bg-red-100 text-red-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "indication": return <Activity className="h-3 w-3" />
      case "strategy": return <TrendingUp className="h-3 w-3" />
      case "position": return <Database className="h-3 w-3" />
      default: return <Clock className="h-3 w-3" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <FileText className="h-3 w-3" />
          Detailed Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Detailed Engine Processing Logs</span>
            <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-1 flex-wrap">
          {["all", "indication", "strategy", "position", "engine", "error"].map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="text-xs h-7"
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>

        {/* Logs ScrollArea */}
        <ScrollArea className="flex-1 min-h-[300px] border rounded-md p-2">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No logs available. Start the engine to see processing logs.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log) => (
                <Collapsible
                  key={log.id}
                  open={expandedIds.has(log.id)}
                  onOpenChange={() => toggleExpand(log.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer text-xs">
                      {expandedIds.has(log.id) ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )}
                      <Badge className={`${getTypeColor(log.type)} text-[10px] px-1 py-0`}>
                        {getTypeIcon(log.type)}
                        <span className="ml-1">{log.type}</span>
                      </Badge>
                      {log.symbol && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {log.symbol}
                        </Badge>
                      )}
                      <span className="text-muted-foreground truncate flex-1">{log.message}</span>
                      <span className="text-muted-foreground text-[10px] shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-6 p-2 bg-muted/50 rounded text-xs space-y-1">
                      {log.details && (
                        <>
                          {log.details.timeframe && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Timeframe:</span>
                              <span className="font-mono">{log.details.timeframe}</span>
                            </div>
                          )}
                          {log.details.timeRange && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Time Range:</span>
                              <span className="font-mono">{log.details.timeRange}</span>
                            </div>
                          )}
                          {log.details.calculatedIndicators !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Indicators Calculated:</span>
                              <span className="font-mono">{log.details.calculatedIndicators}</span>
                            </div>
                          )}
                          {log.details.evaluatedStrategies !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Strategies Evaluated:</span>
                              <span className="font-mono">{log.details.evaluatedStrategies}</span>
                            </div>
                          )}
                          {log.details.pseudoPositions && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Pseudo Positions:</span>
                              <span className="font-mono">
                                Base: {log.details.pseudoPositions.base} | 
                                Main: {log.details.pseudoPositions.main} | 
                                Real: {log.details.pseudoPositions.real}
                              </span>
                            </div>
                          )}
                          {log.details.configs !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Configs Processed:</span>
                              <span className="font-mono">{log.details.configs}</span>
                            </div>
                          )}
                          {log.details.evals !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Evaluations:</span>
                              <span className="font-mono">{log.details.evals}</span>
                            </div>
                          )}
                          {log.details.ratios && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Ratios:</span>
                              <span className="font-mono">
                                Last 25: {log.details.ratios.last25.toFixed(2)} | 
                                Last 50: {log.details.ratios.last50.toFixed(2)} | 
                                Max Pos: {log.details.ratios.maxPos}
                              </span>
                            </div>
                          )}
                          {log.details.cycleDuration !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Cycle Duration:</span>
                              <span className="font-mono">{log.details.cycleDuration}ms</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Smart Results Summary - Updates every 5 sec */}
        {summary && (
          <div className="border-t pt-3 mt-2">
            <div className="text-xs font-semibold mb-2 flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-500" />
              Real-Time Progress Summary
              <Badge variant="outline" className="text-[10px]">
                Updated: {new Date(summary.lastUpdate).toLocaleTimeString()}
              </Badge>
            </div>
            <div className="grid grid-cols-6 gap-2 text-xs">
              <div className="bg-blue-50 rounded p-2 text-center">
                <div className="text-blue-600 font-bold text-lg">{summary.symbolsActive}</div>
                <div className="text-muted-foreground">Symbols Active</div>
              </div>
              <div className="bg-purple-50 rounded p-2 text-center">
                <div className="text-purple-600 font-bold text-lg">{summary.indicationCycles}</div>
                <div className="text-muted-foreground">Indication Cycles</div>
              </div>
              <div className="bg-green-50 rounded p-2 text-center">
                <div className="text-green-600 font-bold text-lg">{summary.strategyCycles}</div>
                <div className="text-muted-foreground">Strategy Cycles</div>
              </div>
              <div className="bg-orange-50 rounded p-2 text-center">
                <div className="text-orange-600 font-bold text-lg">{summary.totalIndicationsCalculated}</div>
                <div className="text-muted-foreground">Indicators Calc</div>
              </div>
              <div className="bg-cyan-50 rounded p-2 text-center">
                <div className="text-cyan-600 font-bold text-lg">{summary.totalStrategiesEvaluated}</div>
                <div className="text-muted-foreground">Strategies Eval</div>
              </div>
              <div className="bg-pink-50 rounded p-2 text-center">
                <div className="text-pink-600 font-bold text-lg">{summary.avgCycleDuration}ms</div>
                <div className="text-muted-foreground">Avg Cycle</div>
              </div>
            </div>
            
            {/* Pseudo Positions Breakdown */}
            <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
              <div className="bg-gray-50 rounded p-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Positions:</span>
                  <span className="font-mono font-semibold">{summary.pseudoPositions.base}</span>
                </div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Main Positions:</span>
                  <span className="font-mono font-semibold">{summary.pseudoPositions.main}</span>
                </div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Real Positions:</span>
                  <span className="font-mono font-semibold">{summary.pseudoPositions.real}</span>
                </div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-mono font-semibold text-green-600">{summary.pseudoPositions.total}</span>
                </div>
              </div>
            </div>
            
            {/* Configs and Errors */}
            <div className="mt-2 flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Configs:</span>
                <span className="font-mono font-semibold">{summary.configsProcessed}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Evals:</span>
                <span className="font-mono font-semibold">{summary.evalsCompleted}</span>
              </div>
              {summary.errors > 0 && (
                <div className="flex items-center gap-1 text-red-600">
                  <span>Errors:</span>
                  <span className="font-mono font-semibold">{summary.errors}</span>
                </div>
              )}
              {summary.warnings > 0 && (
                <div className="flex items-center gap-1 text-yellow-600">
                  <span>Warnings:</span>
                  <span className="font-mono font-semibold">{summary.warnings}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
