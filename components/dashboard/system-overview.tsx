"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Settings, Zap, Database, Network, Activity, TrendingUp } from "lucide-react"

interface SystemStats {
  tradeEngines: {
    globalStatus: string
    mainStatus: string
    presetStatus: string
    totalEnabled: number
  }
  database: {
    status: string
    requestsPerSecond: number
  }
  exchangeConnections: {
    total: number
    enabled: number
    working: number
    status: string
  }
  activeConnections: {
    total: number
    enabled: number
    liveTrade: number
    presetTrade: number
  }
  liveTrades: {
    lastHour: number
    topConnections: Array<{ name: string; count: number }>
  }
}

export function SystemOverview() {
  const [stats, setStats] = useState<SystemStats>({
    tradeEngines: {
      globalStatus: "running",
      mainStatus: "running",
      presetStatus: "idle",
      totalEnabled: 2,
    },
    database: {
      status: "healthy",
      requestsPerSecond: 0,
    },
    exchangeConnections: {
      total: 0,
      enabled: 0,
      working: 0,
      status: "loading",
    },
    activeConnections: {
      total: 0,
      enabled: 0,
      liveTrade: 0,
      presetTrade: 0,
    },
    liveTrades: {
      lastHour: 0,
      topConnections: [],
    },
  })

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await fetch("/api/dashboard/system-stats")
        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error("[v0] Failed to load system stats:", error)
      }
    }

    loadStats()
    const interval = setInterval(loadStats, 5000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
      case "healthy":
      case "working":
        return "bg-green-100 text-green-900 border-green-200"
      case "idle":
      case "stopped":
        return "bg-gray-100 text-gray-600 border-gray-200"
      case "failed":
      case "error":
        return "bg-red-100 text-red-900 border-red-200"
      default:
        return "bg-blue-100 text-blue-900 border-blue-200"
    }
  }

  const getBorderColor = (status: string) => {
    switch (status) {
      case "running":
      case "healthy":
      case "working":
        return "border-l-green-500"
      case "idle":
      case "stopped":
        return "border-l-gray-400"
      case "failed":
      case "error":
        return "border-l-red-500"
      default:
        return "border-l-blue-500"
    }
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Smart Overview</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Trade Engines */}
          <div className={`p-3 rounded-lg border-l-4 ${getBorderColor(stats.tradeEngines.globalStatus)} bg-muted/30`}>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Trade Engines</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Global</span>
                <Badge className={`text-[10px] h-5 ${getStatusColor(stats.tradeEngines.globalStatus)}`}>
                  {stats.tradeEngines.globalStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Main</span>
                <Badge className={`text-[10px] h-5 ${getStatusColor(stats.tradeEngines.mainStatus)}`} title="Requires: Global running + Live Trade enabled">
                  {stats.tradeEngines.mainStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Preset</span>
                <Badge className={`text-[10px] h-5 ${getStatusColor(stats.tradeEngines.presetStatus)}`} title="Requires: Global running + Preset Trade enabled">
                  {stats.tradeEngines.presetStatus}
                </Badge>
              </div>
              <div className="pt-1 border-t mt-2">
                <div className="text-2xl font-bold">{stats.tradeEngines.totalEnabled}</div>
                <div className="text-[10px] text-muted-foreground">Enabled</div>
              </div>
            </div>
          </div>

          {/* Database */}
          <div className={`p-3 rounded-lg border-l-4 ${getBorderColor(stats.database.status)} bg-muted/30`}>
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Database</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge className={`text-[10px] h-5 ${getStatusColor(stats.database.status)}`}>
                  {stats.database.status}
                </Badge>
              </div>
              <div className="pt-1 border-t">
                <div className="text-2xl font-bold">{stats.database.requestsPerSecond}</div>
                <div className="text-[10px] text-muted-foreground">req/sec</div>
              </div>
            </div>
          </div>

          {/* Exchange Connections */}
          <div className={`p-3 rounded-lg border-l-4 ${getBorderColor(stats.exchangeConnections.status)} bg-muted/30`}>
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Exchange Connections</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Inserted</span>
                <span className="font-semibold">{stats.exchangeConnections.total}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Enabled</span>
                <span className="font-semibold text-green-600">{stats.exchangeConnections.enabled}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Working</span>
                <span className="font-semibold text-blue-600">{stats.exchangeConnections.working}</span>
              </div>
              <div className="pt-1 border-t mt-2">
                <Badge className={`text-[10px] h-5 w-full justify-center ${getStatusColor(stats.exchangeConnections.status)}`}>
                  {stats.exchangeConnections.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* Active Connections */}
          <div className="p-3 rounded-lg border-l-4 border-l-green-500 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Active Connections</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Inserted</span>
                <span className="font-semibold">{stats.activeConnections.total}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Enabled</span>
                <span className="font-semibold text-green-600">{stats.activeConnections.enabled}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Live Trade</span>
                <span className="font-semibold text-blue-600">{stats.activeConnections.liveTrade}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Preset</span>
                <span className="font-semibold text-purple-600">{stats.activeConnections.presetTrade}</span>
              </div>
            </div>
          </div>

          {/* Live Trades */}
          <div className="p-3 rounded-lg border-l-4 border-l-cyan-500 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Live Trades (1h)</span>
            </div>
            <div className="space-y-2">
              <div className="pt-1">
                <div className="text-2xl font-bold">{stats.liveTrades.lastHour}</div>
                <div className="text-[10px] text-muted-foreground">Total Trades</div>
              </div>
              {(stats.liveTrades?.topConnections && Array.isArray(stats.liveTrades.topConnections) && stats.liveTrades.topConnections.length > 0) ? (
                <div className="pt-2 border-t space-y-1">
                  <div className="text-[10px] text-muted-foreground mb-1">Top Contributors:</div>
                  {stats.liveTrades.topConnections.slice(0, 3).map((conn, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate">{conn.name}</span>
                      <span className="font-semibold">{conn.count}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
