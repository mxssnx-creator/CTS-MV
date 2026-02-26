"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Activity, Zap } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface ConnectionStats {
  connectionId: string
  connectionName: string
  indications: {
    base: number
    main: number
    real: number
    live: number
    total: number
    evaluated: number
  }
  strategies: {
    base: number
    main: number
    real: number
    live: number
    total: number
    evaluated: number
    drawdown_max: number
    drawdown_time_hours: number
  }
  profit_factor: {
    last_5: number
    last_15: number
    last_50: number
  }
  positions: {
    total_evaluated: number
    winning: number
    losing: number
    win_rate: number
  }
}

interface StatisticsOverviewProps {
  connections?: Array<{ id: string; name: string }> | string
}

export function StatisticsOverview({ connections }: StatisticsOverviewProps) {
  const [allStats, setAllStats] = useState<ConnectionStats[]>([])
  const [aggregateStats, setAggregateStats] = useState<ConnectionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("aggregate")

  // Handle both old prop format (string) and new (array)
  const connectionsList = Array.isArray(connections)
    ? connections
    : typeof connections === "string" && connections
      ? [{ id: connections, name: "Connection" }]
      : []

  useEffect(() => {
    loadStatistics()
    const interval = setInterval(loadStatistics, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [connections])

  const loadStatistics = async () => {
    try {
      setLoading(true)
      setError(null)

      if (connectionsList.length === 0) {
        setAllStats([])
        setAggregateStats(null)
        return
      }

      // Fetch stats for all connections in parallel
      const statsPromises = connectionsList.map(async (conn) => {
        try {
          const response = await fetch(`/api/positions/stats?connection_id=${conn.id}`)
          if (!response.ok) throw new Error("Failed to load stats")

          const data = await response.json()

          // Mock data for indications/strategies (replace with real API when available)
          return {
            connectionId: conn.id,
            connectionName: conn.name,
            indications: {
              base: Math.floor(Math.random() * 100) + 20,
              main: Math.floor(Math.random() * 80) + 15,
              real: Math.floor(Math.random() * 60) + 10,
              live: Math.floor(Math.random() * 40) + 5,
              total: 0,
              evaluated: 0,
            },
            strategies: {
              base: Math.floor(Math.random() * 80) + 15,
              main: Math.floor(Math.random() * 60) + 10,
              real: Math.floor(Math.random() * 40) + 8,
              live: Math.floor(Math.random() * 20) + 3,
              total: 0,
              evaluated: 0,
              drawdown_max: Math.random() * 15 + 5,
              drawdown_time_hours: Math.random() * 24 + 2,
            },
            profit_factor: {
              last_5: 1.2 + Math.random() * 0.5,
              last_15: 1.15 + Math.random() * 0.4,
              last_50: 1.1 + Math.random() * 0.3,
            },
            positions: {
              total_evaluated: data.stats?.total_positions || 0,
              winning: data.stats?.win_count || 0,
              losing: data.stats?.loss_count || 0,
              win_rate: data.stats?.win_rate || 0,
            },
          } as ConnectionStats
        } catch (err) {
          console.error(`Failed to load stats for connection ${conn.id}:`, err)
          return null
        }
      })

      const results = await Promise.all(statsPromises)
      const validStats = results.filter((s) => s !== null) as ConnectionStats[]
      setAllStats(validStats)

      // Calculate aggregate statistics
      if (validStats.length > 0) {
        const aggregate: ConnectionStats = {
          connectionId: "aggregate",
          connectionName: "All Connections",
          indications: {
            base: validStats.reduce((sum, s) => sum + s.indications.base, 0),
            main: validStats.reduce((sum, s) => sum + s.indications.main, 0),
            real: validStats.reduce((sum, s) => sum + s.indications.real, 0),
            live: validStats.reduce((sum, s) => sum + s.indications.live, 0),
            total: validStats.reduce((sum, s) => sum + s.indications.total, 0),
            evaluated: validStats.reduce((sum, s) => sum + s.indications.evaluated, 0),
          },
          strategies: {
            base: validStats.reduce((sum, s) => sum + s.strategies.base, 0),
            main: validStats.reduce((sum, s) => sum + s.strategies.main, 0),
            real: validStats.reduce((sum, s) => sum + s.strategies.real, 0),
            live: validStats.reduce((sum, s) => sum + s.strategies.live, 0),
            total: validStats.reduce((sum, s) => sum + s.strategies.total, 0),
            evaluated: validStats.reduce((sum, s) => sum + s.strategies.evaluated, 0),
            drawdown_max: Math.max(...validStats.map((s) => s.strategies.drawdown_max)),
            drawdown_time_hours: validStats.reduce((sum, s) => sum + s.strategies.drawdown_time_hours, 0) / validStats.length,
          },
          profit_factor: {
            last_5: validStats.reduce((sum, s) => sum + s.profit_factor.last_5, 0) / validStats.length,
            last_15: validStats.reduce((sum, s) => sum + s.profit_factor.last_15, 0) / validStats.length,
            last_50: validStats.reduce((sum, s) => sum + s.profit_factor.last_50, 0) / validStats.length,
          },
          positions: {
            total_evaluated: validStats.reduce((sum, s) => sum + s.positions.total_evaluated, 0),
            winning: validStats.reduce((sum, s) => sum + s.positions.winning, 0),
            losing: validStats.reduce((sum, s) => sum + s.positions.losing, 0),
            win_rate: validStats.reduce((sum, s) => sum + s.positions.win_rate, 0) / validStats.length,
          },
        }
        setAggregateStats(aggregate)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error"
      console.error("[v0] Statistics load error:", errorMsg)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  if (loading && allStats.length === 0) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">Loading statistics...</CardContent>
      </Card>
    )
  }

  if (error && allStats.length === 0) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-destructive">Error: {error}</CardContent>
      </Card>
    )
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="aggregate">Aggregate</TabsTrigger>
        <TabsTrigger value="individual">By Connection</TabsTrigger>
      </TabsList>

      <TabsContent value="aggregate" className="space-y-4">
        {aggregateStats && <StatisticsCards stats={aggregateStats} />}
      </TabsContent>

      <TabsContent value="individual" className="space-y-4">
        {allStats.map((stats) => (
          <div key={stats.connectionId}>
            <h3 className="font-semibold mb-3 text-sm">{stats.connectionName}</h3>
            <StatisticsCards stats={stats} />
          </div>
        ))}
      </TabsContent>
    </Tabs>
  )
}

function StatisticsCards({ stats }: { stats: ConnectionStats }) {
  const indicationsTotal = stats.indications.base + stats.indications.main + stats.indications.real + stats.indications.live
  const strategiesTotal = stats.strategies.base + stats.strategies.main + stats.strategies.real + stats.strategies.live
  const indicationToStrategyRatio = strategiesTotal > 0 ? (indicationsTotal / strategiesTotal).toFixed(2) : "0"
  const strategyToPositionRatio = stats.positions.total_evaluated > 0 ? (strategiesTotal / stats.positions.total_evaluated).toFixed(2) : "0"

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-1">
      {/* Indications Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Indications
          </CardTitle>
          <CardDescription>Evaluated: {stats.indications.evaluated}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Base</div>
              <div className="font-semibold">{stats.indications.base}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Main</div>
              <div className="font-semibold">{stats.indications.main}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Real</div>
              <div className="font-semibold">{stats.indications.real}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Live</div>
              <div className="font-semibold">{stats.indications.live}</div>
            </div>
          </div>
          <div className="bg-muted rounded p-2 text-xs">
            <div className="text-muted-foreground">Total Evaluated</div>
            <div className="font-semibold text-lg">{indicationsTotal}</div>
          </div>
        </CardContent>
      </Card>

      {/* Strategies Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Strategies
          </CardTitle>
          <CardDescription>
            Drawdown: {stats.strategies.drawdown_max.toFixed(1)}% | Time: {stats.strategies.drawdown_time_hours.toFixed(1)}h
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Base</div>
              <div className="font-semibold">{stats.strategies.base}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Main</div>
              <div className="font-semibold">{stats.strategies.main}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Real</div>
              <div className="font-semibold">{stats.strategies.real}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Live</div>
              <div className="font-semibold">{stats.strategies.live}</div>
            </div>
          </div>
          <div className="bg-muted rounded p-2 text-xs">
            <div className="text-muted-foreground">Total Evaluated</div>
            <div className="font-semibold text-lg">{strategiesTotal}</div>
          </div>
        </CardContent>
      </Card>

      {/* Profit Factor Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Profit Factor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last 5</span>
            <div className="flex items-center gap-1">
              <span className="font-semibold">{stats.profit_factor.last_5.toFixed(2)}</span>
              {stats.profit_factor.last_5 >= 1 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last 15</span>
            <div className="flex items-center gap-1">
              <span className="font-semibold">{stats.profit_factor.last_15.toFixed(2)}</span>
              {stats.profit_factor.last_15 >= 1 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last 50</span>
            <div className="flex items-center gap-1">
              <span className="font-semibold">{stats.profit_factor.last_50.toFixed(2)}</span>
              {stats.profit_factor.last_50 >= 1 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Positions & Ratios Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Total Positions</div>
              <div className="font-semibold text-lg">{stats.positions.total_evaluated}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Win Rate</div>
              <div className="font-semibold text-lg">{stats.positions.win_rate.toFixed(1)}%</div>
            </div>
          </div>
          <div className="bg-muted rounded p-2">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-green-600 font-semibold">Wins: {stats.positions.winning}</span>
              <span className="text-red-600 font-semibold">Losses: {stats.positions.losing}</span>
            </div>
            <div className="w-full bg-gray-300 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-green-500 h-full"
                style={{
                  width: `${stats.positions.total_evaluated > 0 ? (stats.positions.winning / stats.positions.total_evaluated) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-100 dark:bg-gray-900 rounded p-2">
              <div className="text-muted-foreground">Indication:Strategy</div>
              <div className="font-semibold text-sm">{indicationToStrategyRatio}:1</div>
            </div>
            <div className="bg-gray-100 dark:bg-gray-900 rounded p-2">
              <div className="text-muted-foreground">Strategy:Position</div>
              <div className="font-semibold text-sm">{strategyToPositionRatio}:1</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

  return (
    <div className="col-span-1 lg:col-span-2 space-y-4">
      {/* Main Statistics Cards Row */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {/* Indications Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Indications</CardTitle>
            <CardDescription>Signal evaluation metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Base / Main</div>
                <div className="font-semibold">
                  {stats.indications.base} / {stats.indications.main}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Real / Live</div>
                <div className="font-semibold">
                  {stats.indications.real} / {stats.indications.live}
                </div>
              </div>
            </div>
            <div className="pt-2 border-t space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Evaluated</span>
                <span className="font-semibold">{stats.indications.evaluated} / {stats.indications.total}</span>
              </div>
              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{
                    width: `${(stats.indications.evaluated / stats.indications.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Strategies Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Strategies</CardTitle>
            <CardDescription>Position generation metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Base / Main</div>
                <div className="font-semibold">
                  {stats.strategies.base} / {stats.strategies.main}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Real / Live</div>
                <div className="font-semibold">
                  {stats.strategies.real} / {stats.strategies.live}
                </div>
              </div>
            </div>
            <div className="pt-2 border-t space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Evaluated</span>
                <span className="font-semibold">{stats.strategies.evaluated} / {stats.strategies.total}</span>
              </div>
              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-green-500 h-full rounded-full transition-all"
                  style={{
                    width: `${(stats.strategies.evaluated / stats.strategies.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profit Factor Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profit Factor</CardTitle>
            <CardDescription>Performance by position count</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="space-y-1 text-center">
                <div className="text-muted-foreground">Last 5</div>
                <div className="flex items-center justify-center gap-1">
                  <div className="font-bold text-sm">{stats.profit_factor.last_5}</div>
                  {stats.profit_factor.last_5 >= 1.0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  )}
                </div>
              </div>
              <div className="space-y-1 text-center">
                <div className="text-muted-foreground">Last 15</div>
                <div className="flex items-center justify-center gap-1">
                  <div className="font-bold text-sm">{stats.profit_factor.last_15}</div>
                  {stats.profit_factor.last_15 >= 1.0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  )}
                </div>
              </div>
              <div className="space-y-1 text-center">
                <div className="text-muted-foreground">Last 50</div>
                <div className="flex items-center justify-center gap-1">
                  <div className="font-bold text-sm">{stats.profit_factor.last_50}</div>
                  {stats.profit_factor.last_50 >= 1.0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Positions & Win Rate Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Positions</CardTitle>
            <CardDescription>Trading performance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Total Evaluated</div>
                <div className="font-semibold text-base">{stats.positions.total_evaluated}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Win Rate</div>
                <div className="font-semibold text-base">{stats.ratios.win_rate_percentage.toFixed(1)}%</div>
              </div>
            </div>
            <div className="pt-2 border-t space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  <span className="text-green-500">⬆</span> {stats.positions.winning} wins
                </span>
                <span className="text-muted-foreground">
                  <span className="text-red-500">⬇</span> {stats.positions.losing} losses
                </span>
              </div>
              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden flex">
                <div
                  className="bg-green-500 rounded-l-full"
                  style={{
                    width: `${
                      stats.positions.total_evaluated > 0
                        ? (stats.positions.winning / stats.positions.total_evaluated) * 100
                        : 0
                    }%`,
                  }}
                />
                <div
                  className="bg-red-500 rounded-r-full"
                  style={{
                    width: `${
                      stats.positions.total_evaluated > 0
                        ? (stats.positions.losing / stats.positions.total_evaluated) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ratios & Metrics Card */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Key Ratios & Metrics</CardTitle>
            <CardDescription>Performance relationships</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Indication → Strategy</div>
                <div className="font-bold text-lg">{stats.ratios.indication_to_strategy}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Strategy → Position</div>
                <div className="font-bold text-lg">{stats.ratios.strategy_to_position}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Max Drawdown</div>
                <div className="font-bold text-lg">{stats.strategies.drawdown_max.toFixed(2)}%</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Drawdown Time</div>
                <div className="font-bold text-lg">{stats.strategies.drawdown_time_hours}h</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
