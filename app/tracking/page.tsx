"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { MapPin, TrendingUp, Activity, BarChart3, RefreshCw } from "lucide-react"
import { toast } from "@/lib/simple-toast"

interface ProgressionState {
  cyclesCompleted: number
  successfulCycles: number
  failedCycles: number
  cycleSuccessRate: number
  totalTrades: number
  totalProfit: number
}

interface TrackingData {
  connectionId: string
  connectionName: string
  progression: ProgressionState
  activePositions: number
  closedPositions: number
  totalVolume: number
  profit: number
  winRate: number
  lastUpdate: string
}

export default function TrackingPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedConnection, setSelectedConnection] = useState<string>("")
  const [connections, setConnections] = useState<Array<{ id: string; name: string; is_enabled: boolean }>>([])
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Load connections
  const loadConnections = async () => {
    try {
      const response = await fetch("/api/settings/connections?enabled=true")
      if (response.ok) {
        const data = await response.json()
        const connectionsList = data.connections || []
        setConnections(connectionsList)
        if (connectionsList.length > 0 && !selectedConnection) {
          setSelectedConnection(connectionsList[0].id)
        }
      }
    } catch (error) {
      console.error("[v0] Failed to load connections:", error)
    }
  }

  // Load tracking data for selected connection
  const loadTrackingData = async () => {
    if (!selectedConnection) return

    setIsLoading(true)
    try {
      // Get progression state
      const progRes = await fetch(`/api/connections/progression/${selectedConnection}`)
      const progData = progRes.ok ? await progRes.json() : {}

      // Get position stats
      const posRes = await fetch(`/api/trading/positions?connectionId=${selectedConnection}`)
      const positions = posRes.ok ? await posRes.json() : []

      const activePos = positions.filter((p: any) => p.status === "open").length
      const closedPos = positions.filter((p: any) => p.status === "closed").length
      const totalVolume = positions.reduce((sum: number, p: any) => sum + (p.size || 0), 0)
      const profit = positions.reduce((sum: number, p: any) => sum + (p.profit_loss || 0), 0)
      const winRate = positions.length > 0 ? ((positions.filter((p: any) => p.profit_loss > 0).length / positions.length) * 100) : 0

      const currentConnection = connections.find((c) => c.id === selectedConnection)

      setTrackingData({
        connectionId: selectedConnection,
        connectionName: currentConnection?.name || "Unknown",
        progression: progData.state || progData || {},
        activePositions: activePos,
        closedPositions: closedPos,
        totalVolume,
        profit,
        winRate,
        lastUpdate: new Date().toISOString(),
      })
    } catch (error) {
      console.error("[v0] Failed to load tracking data:", error)
      toast.error("Failed to load tracking data")
    } finally {
      setIsLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    loadConnections()
  }, [])

  // Load data when connection changes
  useEffect(() => {
    loadTrackingData()
  }, [selectedConnection])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadTrackingData()
    }, 5000)

    return () => clearInterval(interval)
  }, [autoRefresh, selectedConnection])

  const handleManualRefresh = async () => {
    await loadTrackingData()
    toast.success("Data refreshed")
  }

  if (!trackingData) {
    return (
      <main className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Position & Progression Tracking</h1>
            <p className="text-muted-foreground">Monitor positions, cycles, and trading progression in real-time</p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <label className="text-sm font-medium">Select Connection</label>
                <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a connection..." />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        <div className="flex items-center gap-2">
                          {conn.is_enabled && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                          {conn.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <MapPin className="h-8 w-8" />
              Position & Progression Tracking
            </h1>
            <p className="text-muted-foreground mt-1">Monitor {trackingData.connectionName}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Connection</label>
              <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      <div className="flex items-center gap-2">
                        {conn.is_enabled && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                        {conn.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Auto Refresh</label>
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {autoRefresh ? "On" : "Off"}
              </Button>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{trackingData.activePositions}</div>
              <p className="text-xs text-muted-foreground mt-1">Open trades</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Closed Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{trackingData.closedPositions}</div>
              <p className="text-xs text-muted-foreground mt-1">Completed trades</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${trackingData.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                ${trackingData.profit.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Profit/Loss</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{trackingData.winRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1">Success rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="progression" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Progression
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Position Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Position Summary</CardTitle>
                  <CardDescription>Current position breakdown</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Active Positions</span>
                      <Badge variant="outline">{trackingData.activePositions}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Closed Positions</span>
                      <Badge variant="outline">{trackingData.closedPositions}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Total Volume</span>
                      <Badge variant="outline">{trackingData.totalVolume.toFixed(2)}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Total Profit</span>
                      <Badge className={trackingData.profit >= 0 ? "bg-green-600" : "bg-red-600"}>
                        ${trackingData.profit.toFixed(2)}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trading Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle>Trading Statistics</CardTitle>
                  <CardDescription>Performance metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">Win Rate</span>
                      <span className="text-sm font-semibold">{trackingData.winRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={trackingData.winRate} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">Cycle Success Rate</span>
                      <span className="text-sm font-semibold">
                        {trackingData.progression?.cycleSuccessRate?.toFixed(1) || 0}%
                      </span>
                    </div>
                    <Progress value={trackingData.progression?.cycleSuccessRate || 0} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Progression Tab */}
          <TabsContent value="progression" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cycle Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle>Cycle Statistics</CardTitle>
                  <CardDescription>Engine progression tracking</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Total Cycles</p>
                      <p className="text-2xl font-bold">{trackingData.progression?.cyclesCompleted || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Successful</p>
                      <p className="text-2xl font-bold text-green-600">{trackingData.progression?.successfulCycles || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Failed</p>
                      <p className="text-2xl font-bold text-red-600">{trackingData.progression?.failedCycles || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                      <p className="text-2xl font-bold">
                        {trackingData.progression?.cycleSuccessRate?.toFixed(1) || 0}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Progress Visualization */}
              <Card>
                <CardHeader>
                  <CardTitle>Progress Breakdown</CardTitle>
                  <CardDescription>Cycle success distribution</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">Success Rate</span>
                      <span className="text-sm font-semibold">
                        {trackingData.progression?.cycleSuccessRate?.toFixed(1) || 0}%
                      </span>
                    </div>
                    <Progress value={trackingData.progression?.cycleSuccessRate || 0} className="h-2" />
                  </div>
                  <div className="pt-4 space-y-2 text-xs text-muted-foreground">
                    <p>• Successful: {trackingData.progression?.successfulCycles || 0} cycles</p>
                    <p>• Failed: {trackingData.progression?.failedCycles || 0} cycles</p>
                    <p>• Total Profit: ${trackingData.progression?.totalProfit?.toFixed(2) || 0}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Real-Time Activity</CardTitle>
                <CardDescription>Last update: {new Date(trackingData.lastUpdate).toLocaleTimeString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Engine Status</p>
                      <p className="text-xs text-muted-foreground">Monitoring active trades and indications</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm font-semibold">Active</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <p className="font-semibold">Connected to: {trackingData.connectionName}</p>
                    <p className="text-muted-foreground">Tracking {trackingData.activePositions} active positions</p>
                    <p className="text-muted-foreground">Processed {trackingData.progression?.cyclesCompleted || 0} cycles</p>
                  </div>

                  <Button
                    onClick={handleManualRefresh}
                    disabled={isLoading}
                    className="w-full"
                    variant="outline"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    {isLoading ? "Refreshing..." : "Refresh Now"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
