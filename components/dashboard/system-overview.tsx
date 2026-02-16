"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Activity, Database, Link2, Zap, TrendingUp, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface SystemStats {
  tradeEngines: {
    globalStatus: "running" | "stopped" | "error"
    mainTradeStatus: "running" | "stopped" | "error"
    presetTradeStatus: "running" | "stopped" | "error"
    enabledCount: number
    totalCount: number
  }
  database: {
    status: "healthy" | "degraded" | "down"
    requestsPerSecond: number
  }
  exchangeConnections: {
    totalInserted: number
    enabled: number
    working: number
    status: "healthy" | "partial" | "down"
  }
  activeConnections: {
    totalInserted: number
    enabled: number
    liveTrade: number
    presetTrade: number
  }
  liveTrades: {
    lastHour: number
    byConnection: { name: string; count: number }[]
  }
}

export function SystemOverview() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSystemStats()
    const interval = setInterval(fetchSystemStats, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  async function fetchSystemStats() {
    try {
      const response = await fetch("/api/dashboard/system-stats")
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error("[v0] Failed to fetch system stats:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!stats) return null

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
      case "healthy":
        return "bg-green-100 text-green-800 border-green-200"
      case "stopped":
      case "degraded":
      case "partial":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "error":
      case "down":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
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
        <CardContent className="p-0">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Trade Engines</span>
            </div>
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
              <Badge className={`text-[10px] h-5 ${getStatusColor(stats.tradeEngines.mainTradeStatus)}`}>
                {stats.tradeEngines.mainTradeStatus}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Preset</span>
              <Badge className={`text-[10px] h-5 ${getStatusColor(stats.tradeEngines.presetTradeStatus)}`}>
                {stats.tradeEngines.presetTradeStatus}
              </Badge>
            </div>
            <div className="pt-1 border-t mt-2">
              <div className="text-lg font-bold">{stats.tradeEngines.enabledCount}</div>
              <div className="text-[10px] text-muted-foreground">Enabled of {stats.tradeEngines.totalCount}</div>
            </div>
          </div>
        </CardContent>
      </div>

      {/* Database */}
      <div className="p-3 rounded-lg border-l-4 border-l-purple-500 bg-muted/30">
        <CardContent className="p-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-semibold text-muted-foreground">Database</span>
            </div>
            <Badge className={`text-[10px] h-5 ${getStatusColor(stats.database.status)}`}>
              {stats.database.status}
            </Badge>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-2xl font-bold">{stats.database.requestsPerSecond}</div>
              <div className="text-[10px] text-muted-foreground">Requests/sec</div>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" />
              <span>Redis Live</span>
            </div>
          </div>
        </CardContent>
      </div>

      {/* Exchange Connections */}
      <div className="p-3 rounded-lg border-l-4 border-l-orange-500 bg-muted/30">
        <CardContent className="p-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-semibold text-muted-foreground">Exchange Connections</span>
            </div>
            <Badge className={`text-[10px] h-5 ${getStatusColor(stats.exchangeConnections.status)}`}>
              {stats.exchangeConnections.status}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{stats.exchangeConnections.totalInserted}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Enabled</span>
              <span className="font-semibold text-green-600">{stats.exchangeConnections.enabled}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Working</span>
              <span className="font-semibold text-blue-600">{stats.exchangeConnections.working}</span>
            </div>
          </div>
        </CardContent>
      </div>

      {/* Active Connections */}
      <div className="p-3 rounded-lg border-l-4 border-l-green-500 bg-muted/30">
        <CardContent className="p-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" />
              <span className="text-xs font-semibold text-muted-foreground">Active Connections</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{stats.activeConnections.totalInserted}</span>
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
              <span className="text-muted-foreground">Preset Trade</span>
              <span className="font-semibold text-purple-600">{stats.activeConnections.presetTrade}</span>
            </div>
          </div>
        </CardContent>
      </div>

      {/* Live Trades Last Hour */}
      <div className="p-3 rounded-lg border-l-4 border-l-cyan-500 bg-muted/30">
        <CardContent className="p-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-cyan-500" />
              <span className="text-xs font-semibold text-muted-foreground">Live Trades (1h)</span>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-2xl font-bold">{stats.liveTrades.lastHour}</div>
              <div className="text-[10px] text-muted-foreground">Total trades</div>
            </div>
            <div className="space-y-1 max-h-16 overflow-y-auto">
              {stats.liveTrades.byConnection.slice(0, 3).map((conn, i) => (
                <div key={i} className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground truncate max-w-[80px]">{conn.name}</span>
                  <span className="font-semibold">{conn.count}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </div>
    </div>
      </CardContent>
    </Card>
  )
}
