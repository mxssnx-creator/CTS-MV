"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Activity } from "lucide-react"

export interface StatisticsData {
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
  ratios: {
    indication_to_strategy: string
    strategy_to_position: string
    win_rate_percentage: number
  }
}

interface StatisticsOverviewProps {
  connectionId: string
}

export function StatisticsOverview({ connectionId }: StatisticsOverviewProps) {
  const [stats, setStats] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStatistics()
    const interval = setInterval(loadStatistics, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [connectionId])

  const loadStatistics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/positions/stats?connection_id=${connectionId}`)
      
      if (!response.ok) {
        throw new Error("Failed to load statistics")
      }

      const data = await response.json()
      
      // Transform API response to our Statistics format
      const statsData: StatisticsData = {
        indications: {
          base: Math.floor(Math.random() * 100) + 20, // Mock data - replace with real
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
          drawdown_max: parseFloat((Math.random() * 15).toFixed(2)),
          drawdown_time_hours: Math.floor(Math.random() * 48),
        },
        profit_factor: {
          last_5: parseFloat((1.2 + Math.random() * 0.8).toFixed(2)),
          last_15: parseFloat((1.1 + Math.random() * 0.9).toFixed(2)),
          last_50: parseFloat((1.0 + Math.random() * 1.0).toFixed(2)),
        },
        positions: {
          total_evaluated: data.stats?.total_positions || 0,
          winning: data.stats?.win_count || 0,
          losing: data.stats?.loss_count || 0,
          win_rate: data.stats?.win_rate || 0,
        },
        ratios: {
          indication_to_strategy: "2.5:1",
          strategy_to_position: "1.8:1",
          win_rate_percentage: (data.stats?.win_rate || 0) * 100,
        },
      }

      // Calculate totals
      statsData.indications.total =
        statsData.indications.base +
        statsData.indications.main +
        statsData.indications.real +
        statsData.indications.live
      statsData.indications.evaluated = Math.floor(statsData.indications.total * 0.85)

      statsData.strategies.total =
        statsData.strategies.base +
        statsData.strategies.main +
        statsData.strategies.real +
        statsData.strategies.live
      statsData.strategies.evaluated = Math.floor(statsData.strategies.total * 0.75)

      setStats(statsData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      console.error("[v0] Failed to load statistics:", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !stats) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  if (error || !stats) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive">{error || "No data available"}</div>
        </CardContent>
      </Card>
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
