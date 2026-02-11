"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TradingOverview } from "@/components/live-trading/trading-overview"
import { TradeEngineProgression } from "@/components/live-trading/trade-engine-progression"
import { PositionCard } from "@/components/live-trading/position-card"
import type { TradingPosition, TradingStats, TimeRangeStats } from "@/lib/trading"
import { TradingEngine } from "@/lib/trading"
import { Activity, RefreshCw, BarChart3, History } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import { useExchange } from "@/lib/exchange-context"
import { PageHeader } from "@/components/page-header"

export default function LiveTradingPage() {
  const { selectedExchange } = useExchange()
  // ... existing state ...
  
  const handleStartEngine = async () => {
    if (!selectedConnection) {
      toast.error("Please select a connection")
      return
    }

    try {
      console.log("[v0] Starting trade engine for connection:", selectedConnection)
      const response = await fetch("/api/trade-engine/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: selectedConnection }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Failed to start engine")

      console.log("[v0] Trade engine started successfully")
      setIsEngineRunning(true)
      toast.success(`Trade engine started for ${result.connectionName}`)
    } catch (error) {
      console.error("[v0] Failed to start trade engine:", error)
      toast.error(error instanceof Error ? error.message : "Failed to start trade engine")
    }
  }
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedConnection, setSelectedConnection] = useState<string>("")
  const [tradingEngine] = useState(() => new TradingEngine())
  const [openPositions, setOpenPositions] = useState<TradingPosition[]>([])
  const [closedPositions, setClosedPositions] = useState<TradingPosition[]>([])
  const [tradingStats, setTradingStats] = useState<TradingStats>({
    total_positions: 0,
    open_positions: 0,
    closed_positions: 0,
    total_volume: 0,
    total_pnl: 0,
    win_rate: 0,
    avg_hold_time: 0,
    largest_win: 0,
    largest_loss: 0,
    balance: 10000,
    equity: 10000,
    margin: 0,
    free_margin: 10000,
  })
  const [timeRangeStats, setTimeRangeStats] = useState<{
    "4h": TimeRangeStats
    "12h": TimeRangeStats
    "24h": TimeRangeStats
    "48h": TimeRangeStats
  }>({
    "4h": { positions_count: 0, total_pnl: 0, win_rate: 0, avg_profit: 0, balance_change: 0 },
    "12h": { positions_count: 0, total_pnl: 0, win_rate: 0, avg_profit: 0, balance_change: 0 },
    "24h": { positions_count: 0, total_pnl: 0, win_rate: 0, avg_profit: 0, balance_change: 0 },
    "48h": { positions_count: 0, total_pnl: 0, win_rate: 0, avg_profit: 0, balance_change: 0 },
  })

  // State to track if real connections exist
  const [hasRealConnections, setHasRealConnections] = useState(false)
  const [connections, setConnections] = useState<Array<{ id: string; name: string; is_enabled: boolean }>>([])
  const [isEngineRunning, setIsEngineRunning] = useState(false)

  const loadConnections = async () => {
    try {
      const url = selectedExchange 
        ? `/api/settings/connections?enabled=true&exchange=${selectedExchange}`
        : "/api/settings/connections?enabled=true"
      
      console.log("[v0] [Live Trading] Loading connections for exchange:", selectedExchange || "all")
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        const connectionsList = data.connections || []
        setConnections(connectionsList)
        setHasRealConnections(connectionsList.length > 0)
        
        if (connectionsList.length > 0 && !selectedConnection) {
          setSelectedConnection(connectionsList[0].id)
        }
      }
    } catch (error) {
      console.error("[v0] [Live Trading] Failed to load connections:", error)
    }
  }

  useEffect(() => {
    loadConnections()
  }, [selectedExchange])

  useEffect(() => {
    if (!hasRealConnections) {
      tradingEngine.generateMockPositions(selectedConnection, 25)
      refreshData()

      // Simulate real-time price updates
      const interval = setInterval(() => {
        const positions = tradingEngine.getOpenPositions(selectedConnection)
        positions.forEach((position) => {
          const priceChange = (Math.random() - 0.5) * 100
          const newPrice = position.current_price + priceChange
          tradingEngine.updatePositionPrice(position.id, Math.max(newPrice, 100))
        })
        refreshData()
      }, 3000)

      return () => clearInterval(interval)
    } else {
      console.log("[v0] Loading real trading data from connected exchanges")
      
      // Load real positions from API
      const loadRealData = async () => {
        try {
          const response = await fetch(`/api/trading/positions?connectionId=${selectedConnection}`)
          if (response.ok) {
            const positions = await response.json()
            console.log("[v0] Loaded", positions.length, "real positions")
            const connectionPositions = positions.filter((p: any) => 
              !selectedConnection || p.connection_id === selectedConnection
            ) as TradingPosition[]
            setOpenPositions(connectionPositions)
          }
        } catch (error) {
          console.error("[v0] Failed to load real positions:", error)
        }
      }
      
      loadRealData()
      const interval = setInterval(loadRealData, 5000) // Refresh every 5 seconds
      return () => clearInterval(interval)
    }
  }, [selectedConnection, hasRealConnections])

  const refreshData = async () => {
    if (!hasRealConnections) {
      const openPos = tradingEngine.getOpenPositions(selectedConnection)
      const closedPos = tradingEngine.getClosedPositions(selectedConnection)
      const stats = tradingEngine.getTradingStats(selectedConnection)

      setOpenPositions(openPos)
      setClosedPositions(closedPos)
      setTradingStats(stats)

      setTimeRangeStats({
        "4h": tradingEngine.getTimeRangeStats(4, selectedConnection),
        "12h": tradingEngine.getTimeRangeStats(12, selectedConnection),
        "24h": tradingEngine.getTimeRangeStats(24, selectedConnection),
        "48h": tradingEngine.getTimeRangeStats(48, selectedConnection),
      })
    } else {
      try {
        console.log("[v0] Fetching real trading data from API")
        
        // Fetch positions
        const posResponse = await fetch("/api/positions")
        if (posResponse.ok) {
          const positions = await posResponse.json()
          console.log(`[v0] Fetched ${positions.length} real positions`)
          // Filter to connection-specific positions if needed
          const connectionPositions = positions.filter((p: any) => 
            !selectedConnection || p.connection_id === selectedConnection
          ) as TradingPosition[]
          setOpenPositions(connectionPositions)
        }
        
        // Fetch stats
        const statsResponse = await fetch("/api/trading/stats")
        if (statsResponse.ok) {
          const stats = await statsResponse.json()
          console.log("[v0] Fetched real trading stats:", stats)
          setTradingStats(stats)
        }
      } catch (error) {
        console.error("[v0] Failed to fetch real trading data:", error)
      }
    }
  }

  const handleClosePosition = async (positionId: string) => {
    const closed = await tradingEngine.closePosition(positionId)
    if (closed) {
      toast.success(`Position ${closed.symbol} closed with P&L: $${closed.profit_loss.toFixed(2)}`)
      refreshData()
    }
  }

  const handleCloseProfitablePositions = async () => {
    const closed = await tradingEngine.closeProfitablePositions(selectedConnection)
    toast.success(`Closed ${closed.length} profitable positions`)
    refreshData()
  }

  const handleCloseAllPositions = async () => {
    const closed = await tradingEngine.closeAllPositions(selectedConnection)
    toast.success(`Closed ${closed.length} positions`)
    refreshData()
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Real Trading Status Banner */}
      {hasRealConnections && (
        <div className="sticky top-0 z-50 w-full bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-b border-green-700/30 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-green-300">Real Trading Active</p>
                <p className="text-xs text-green-300/70">
                  {connections.filter(c => c.is_enabled).length} enabled connection(s) • {isEngineRunning ? "Engine Running" : "Ready to Start"}
                </p>
              </div>
            </div>
            <Button
              onClick={handleStartEngine}
              disabled={!selectedConnection || isEngineRunning}
              className="bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              {isEngineRunning ? "Engine Running" : "Start Engine"}
            </Button>
          </div>
        </div>
      )}

      {/* Page Content */}
      <div className="container mx-auto p-6 space-y-6">
        {!hasRealConnections && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-yellow-500" />
              <div>
                <div className="font-semibold text-yellow-900 dark:text-yellow-100">Using Mock Data</div>
                <div className="text-sm text-yellow-700 dark:text-yellow-300">
                  No active exchange connections found. Enable a connection in Settings to see real trading data.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Live Trading</h1>
            <p className="text-muted-foreground">Monitor active positions and trading activity</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Connection</label>
              <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                <SelectTrigger className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      <div className="flex items-center gap-2">
                        {conn.is_enabled && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                        {conn.name}
                        {!conn.is_enabled && <span className="text-xs text-muted-foreground">(Mock)</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={refreshData} variant="outline" size="sm" className="mt-5 bg-transparent">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="positions" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Open Positions ({openPositions.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Position History
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <TradingOverview
              stats={tradingStats}
              timeRangeStats={timeRangeStats}
              onCloseProfitablePositions={handleCloseProfitablePositions}
              onCloseAllPositions={handleCloseAllPositions}
            />
          </TabsContent>

          <TabsContent value="positions" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Open Positions ({openPositions.length})</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCloseProfitablePositions}>
                  Close Profitable
                </Button>
                <Button variant="destructive" onClick={handleCloseAllPositions}>
                  Close All
                </Button>
              </div>
            </div>

            {openPositions.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Open Positions</h3>
                <p className="text-muted-foreground">All positions are currently closed or no trading activity.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {openPositions.map((position) => (
                  <PositionCard
                    key={position.id}
                    position={position}
                    onClose={handleClosePosition}
                    showCloseButton={true}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Position History ({closedPositions.length})</h2>
              <p className="text-sm text-muted-foreground">Last 50 closed positions</p>
            </div>

            {closedPositions.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Trading History</h3>
                <p className="text-muted-foreground">No closed positions found for this connection.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {closedPositions.map((position) => (
                  <PositionCard key={position.id} position={position} showCloseButton={false} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <TradeEngineProgression />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
