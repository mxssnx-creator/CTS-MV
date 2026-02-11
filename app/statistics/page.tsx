"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { AnalyticsFilters } from "@/components/statistics/analytics-filters"
import { StrategyPerformanceTable } from "@/components/statistics/strategy-performance-table"
import { AnalyticsEngine } from "@/lib/analytics"
import { TradingEngine } from "@/lib/trading"
import type { AnalyticsFilter, StrategyAnalytics, SymbolAnalytics, TimeSeriesData } from "@/lib/analytics"
import type { TradingPosition } from "@/lib/trading"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { TrendingUp, BarChart3, PieChartIcon, RefreshCw, Activity, AlertTriangle } from "lucide-react"
import { AdjustStrategyStats } from "@/components/statistics/adjust-strategy-stats"
import { BlockStrategyStats } from "@/components/statistics/block-strategy-stats"
import { PresetTradeStats } from "@/components/statistics/preset-trade-stats"
import { StatisticsOverview } from "@/components/settings/statistics-overview"
import { useExchange } from "@/lib/exchange-context"
import { PageHeader } from "@/components/page-header"

export default function StatisticsPage() {
  const { selectedExchange } = useExchange()
  const [activeTab, setActiveTab] = useState("overview")
  const [analyticsEngine, setAnalyticsEngine] = useState<AnalyticsEngine | null>(null)
  const [hasRealConnections, setHasRealConnections] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<AnalyticsFilter>({
    symbols: [],
    timeRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: new Date(),
    },
    indicationTypes: [],
    strategyTypes: [],
    trailingEnabled: undefined,
    minProfitFactor: undefined,
    maxDrawdown: undefined,
  })

  const [strategyAnalytics, setStrategyAnalytics] = useState<StrategyAnalytics[]>([])
  const [symbolAnalytics, setSymbolAnalytics] = useState<SymbolAnalytics[]>([])
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([])
  const [mockPositions, setMockPositions] = useState<TradingPosition[]>([])
  const [settings, setSettings] = useState<any>(null)

  useEffect(() => {
    async function initialize() {
      setIsLoading(true)

      try {
        const url = selectedExchange 
          ? `/api/settings/connections?exchange=${selectedExchange}`
          : "/api/settings/connections"
        
        console.log("[v0] [Statistics] Loading connections for exchange:", selectedExchange || "all")
        const response = await fetch(url)
        const data = await response.json()
        const activeConnections = data.connections?.filter((c: any) => c.is_enabled) || []
        setHasRealConnections(activeConnections.length > 0)

        const settingsResponse = await fetch("/api/settings")
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json()
          setSettings(settingsData.settings || {})
        }

        if (activeConnections.length === 0) {
          const tradingEngine = new TradingEngine()
          const connections = ["bybit-x03", "bingx-x01", "pionex-x01"]
          const positions: TradingPosition[] = []

          connections.forEach((connectionId) => {
            tradingEngine.generateMockPositions(connectionId, 50)
            positions.push(...tradingEngine.getOpenPositions(connectionId))
            positions.push(...tradingEngine.getClosedPositions(connectionId, 100))
          })

          setMockPositions(positions)
          const engine = new AnalyticsEngine(positions)
          setAnalyticsEngine(engine)
          updateAnalytics(engine, filter)
        }
      } catch (error) {
        console.error("Failed to check connections:", error)
      } finally {
        setIsLoading(false)
      }
    }

    initialize()
  }, [selectedExchange])

  const updateAnalytics = (engine: AnalyticsEngine, currentFilter: AnalyticsFilter) => {
    const strategies = engine.generateStrategyAnalytics(currentFilter)
    const symbols = engine.generateSymbolAnalytics(currentFilter)
    const timeSeries = engine.generateTimeSeriesData(currentFilter)

    setStrategyAnalytics(strategies)
    setSymbolAnalytics(symbols)
    setTimeSeriesData(timeSeries)
  }

  const handleFilterChange = (newFilter: AnalyticsFilter) => {
    setFilter(newFilter)
    if (analyticsEngine) {
      updateAnalytics(analyticsEngine, newFilter)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"]

  const overviewStats = {
    totalStrategies: strategyAnalytics.length,
    profitableStrategies: strategyAnalytics.filter((s) => s.profit_factor > 1).length,
    totalTrades: strategyAnalytics.reduce((sum, s) => sum + s.total_trades, 0),
    totalPnL: strategyAnalytics.reduce((sum, s) => sum + s.total_pnl, 0),
    avgWinRate:
      strategyAnalytics.length > 0
        ? strategyAnalytics.reduce((sum, s) => sum + s.win_rate, 0) / strategyAnalytics.length
        : 0,
    bestStrategy: strategyAnalytics[0]?.strategy_name || "N/A",
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-muted-foreground">Loading statistics...</div>
        </div>
      </div>
    )
  }

  if (hasRealConnections) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Real Trading Data</h2>
          <p className="text-muted-foreground">
            Statistics will be populated with real trading data from your active connections.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <div>
            <div className="font-semibold text-yellow-700 dark:text-yellow-400">Using Mock Data</div>
            <div className="text-sm text-yellow-600 dark:text-yellow-500">
              No active exchange connections found. Enable a connection in Settings to see real statistics.
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Statistics & Analytics</h1>
          <p className="text-muted-foreground">Comprehensive trading performance analysis</p>
        </div>
        <Button onClick={() => analyticsEngine && updateAnalytics(analyticsEngine, filter)}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{overviewStats.totalStrategies}</div>
                <div className="text-sm text-muted-foreground">Total Strategies</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{overviewStats.profitableStrategies}</div>
                <div className="text-sm text-muted-foreground">Profitable</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{overviewStats.totalTrades}</div>
                <div className="text-sm text-muted-foreground">Total Trades</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className={`h-5 w-5 rounded ${overviewStats.totalPnL >= 0 ? "bg-green-500" : "bg-red-500"}`} />
              <div>
                <div
                  className={`text-2xl font-bold ${overviewStats.totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {formatCurrency(overviewStats.totalPnL)}
                </div>
                <div className="text-sm text-muted-foreground">Total P&L</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{(overviewStats.avgWinRate * 100).toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground">Avg Win Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 bg-cyan-500 rounded" />
              <div>
                <div className="text-lg font-bold truncate">{overviewStats.bestStrategy}</div>
                <div className="text-sm text-muted-foreground">Best Strategy</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <AnalyticsFilters filter={filter} onFilterChange={handleFilterChange} />
        </div>

        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="strategies">Strategies</TabsTrigger>
              <TabsTrigger value="adjust">Adjust</TabsTrigger>
              <TabsTrigger value="block">Block</TabsTrigger>
              <TabsTrigger value="preset">Preset</TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Balance & Equity Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeSeriesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        formatter={(value: number) => [formatCurrency(value), ""]}
                      />
                      <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} name="Balance" />
                      <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} name="Equity" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Strategy Type Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={strategyAnalytics.slice(0, 5)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="strategy_type" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => [value.toFixed(2), "Profit Factor"]} />
                        <Bar dataKey="profit_factor" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Symbol Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={symbolAnalytics.slice(0, 6).map((s) => ({
                            symbol: s.symbol,
                            total_trades: s.total_trades,
                            total_pnl: s.total_pnl,
                            win_rate: s.win_rate,
                            avg_profit_per_trade: s.avg_profit_per_trade,
                            volatility: s.volatility,
                            best_strategy: s.best_strategy,
                            worst_strategy: s.worst_strategy,
                          }))}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="total_trades"
                          label={({ symbol, percent }: any) => `${symbol} ${(percent * 100).toFixed(0)}%`}
                        >
                          {symbolAnalytics.slice(0, 6).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="strategies" className="space-y-6">
              <StrategyPerformanceTable
                strategies={strategyAnalytics}
                onStrategyClick={(strategy) => {
                  console.log("Strategy clicked:", strategy)
                }}
              />
            </TabsContent>

            <TabsContent value="symbols" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Symbol Performance Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {symbolAnalytics.map((symbol, index) => (
                      <Card key={symbol.symbol}>
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-lg">{symbol.symbol}</h3>
                              <div
                                className={`text-sm font-medium ${symbol.total_pnl >= 0 ? "text-green-600" : "text-red-600"}`}
                              >
                                {formatCurrency(symbol.total_pnl)}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <div className="text-muted-foreground">Trades</div>
                                <div className="font-medium">{symbol.total_trades}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Win Rate</div>
                                <div className="font-medium">{(symbol.win_rate * 100).toFixed(1)}%</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Avg/Trade</div>
                                <div className="font-medium">{formatCurrency(symbol.avg_profit_per_trade)}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Volatility</div>
                                <div className="font-medium">{(symbol.volatility * 100).toFixed(1)}%</div>
                              </div>
                            </div>
                            <div className="pt-2 border-t text-xs">
                              <div className="text-muted-foreground">Best: {symbol.best_strategy}</div>
                              <div className="text-muted-foreground">Worst: {symbol.worst_strategy}</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="charts" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Cumulative P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeSeriesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        formatter={(value: number) => [formatCurrency(value), "Cumulative P&L"]}
                      />
                      <Line type="monotone" dataKey="cumulative_pnl" stroke="#10b981" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Daily P&L</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={timeSeriesData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
                        <YAxis tickFormatter={(value) => formatCurrency(value)} />
                        <Tooltip
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                          formatter={(value: number) => [formatCurrency(value), "Daily P&L"]}
                        />
                        <Bar dataKey="daily_pnl">
                          {timeSeriesData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.daily_pnl >= 0 ? "#10b981" : "#ef4444"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Open Positions Over Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={timeSeriesData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
                        <YAxis />
                        <Tooltip
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                          formatter={(value: number) => [value, "Open Positions"]}
                        />
                        <Line type="monotone" dataKey="open_positions" stroke="#f59e0b" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="preset" className="space-y-6">
              <PresetTradeStats filter={filter} positions={mockPositions} />
            </TabsContent>

            <TabsContent value="adjust" className="space-y-6">
              <AdjustStrategyStats
                positions={mockPositions
                  .filter((p) => p.status === "closed")
                  .map((p) => ({
                    id: p.id,
                    connection_id: p.connection_id,
                    symbol: p.symbol,
                    indication_type: (p.indication_type || "direction") as "direction" | "move" | "active",
                    takeprofit_factor: 2.0, // Default value
                    stoploss_ratio: 0.5, // Default value
                    trailing_enabled: false,
                    entry_price: p.entry_price,
                    current_price: p.current_price,
                    profit_factor:
                      p.realized_pnl > 0
                        ? 1 + Math.abs(p.realized_pnl) / (p.margin_used || 100)
                        : 1 - Math.abs(p.realized_pnl) / (p.margin_used || 100),
                    position_cost: p.margin_used || 100,
                    status: "closed" as const,
                    created_at: p.opened_at,
                    updated_at: p.closed_at || p.opened_at,
                  }))}
                timeIntervals={[4, 12, 24, 48]}
                drawdownPositionCount={80}
              />
            </TabsContent>

            <TabsContent value="block" className="space-y-6">
              <BlockStrategyStats
                positions={mockPositions
                  .filter((p) => p.status === "closed")
                  .map((p) => ({
                    id: p.id,
                    connection_id: p.connection_id,
                    symbol: p.symbol,
                    indication_type: (p.indication_type || "direction") as "direction" | "move" | "active",
                    takeprofit_factor: 2.0, // Default value
                    stoploss_ratio: 0.5, // Default value
                    trailing_enabled: false,
                    entry_price: p.entry_price,
                    current_price: p.current_price,
                    profit_factor:
                      p.realized_pnl > 0
                        ? 1 + Math.abs(p.realized_pnl) / (p.margin_used || 100)
                        : 1 - Math.abs(p.realized_pnl) / (p.margin_used || 100),
                    position_cost: p.margin_used || 100,
                    status: "closed" as const,
                    created_at: p.opened_at,
                    updated_at: p.closed_at || p.opened_at,
                  }))}
                comparisonWindow={50}
              />
            </TabsContent>

            <TabsContent value="config" className="space-y-4">
              {settings ? (
                <StatisticsOverview settings={settings} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Loading Configuration...</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Please wait while we load the system configuration.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
