"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Activity, AlertCircle } from "lucide-react"

interface StrategyMetrics {
  type: "base" | "main" | "real" | "live"
  count: number
  winRate: number
  drawdown: number
  drawdownHours: number
  profitFactor250: number
  profitFactor50: number
}

interface SymbolStats {
  symbol: string
  livePositions: number
  profitFactor250: number
  profitFactor50: number
}

interface PerformanceMetrics {
  last250Positions: {
    total: number
    winning: number
    losing: number
    winRate: number
    profitFactor: number
    totalProfit: number
  }
  last50Positions: {
    total: number
    winning: number
    losing: number
    winRate: number
    profitFactor: number
    totalProfit: number
  }
  last32Hours: {
    totalPositions: number
    totalProfit: number
    profitFactor: number
  }
}

interface StatisticsOverviewV2Props {
  connections?: Array<{ id: string; name: string }> | string
}

export function StatisticsOverviewV2({ connections }: StatisticsOverviewV2Props) {
  const [strategies, setStrategies] = useState<StrategyMetrics[]>([])
  const [symbols, setSymbols] = useState<SymbolStats[]>([])
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStatistics()
    const interval = setInterval(loadStatistics, 15000)
    return () => clearInterval(interval)
  }, [connections])

  const loadStatistics = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch performance metrics
      const perfResponse = await fetch("/api/trading/stats")
      if (perfResponse.ok) {
        const perfData = await perfResponse.json()
        setPerformance({
          last250Positions: {
            total: perfData.last250?.total || 0,
            winning: perfData.last250?.wins || 0,
            losing: perfData.last250?.losses || 0,
            winRate: perfData.last250?.winRate || 0,
            profitFactor: perfData.last250?.profitFactor || 0,
            totalProfit: perfData.last250?.totalProfit || 0,
          },
          last50Positions: {
            total: perfData.last50?.total || 0,
            winning: perfData.last50?.wins || 0,
            losing: perfData.last50?.losses || 0,
            winRate: perfData.last50?.winRate || 0,
            profitFactor: perfData.last50?.profitFactor || 0,
            totalProfit: perfData.last50?.totalProfit || 0,
          },
          last32Hours: {
            totalPositions: perfData.last32h?.total || 0,
            totalProfit: perfData.last32h?.totalProfit || 0,
            profitFactor: perfData.last32h?.profitFactor || 0,
          },
        })
      }

      // Fetch symbol statistics
      const symbolResponse = await fetch("/api/exchange-positions/symbols-stats")
      if (symbolResponse.ok) {
        const symbolData = await symbolResponse.json()
        const symbolsList = (symbolData.symbols || []).slice(0, 22).map((s: any) => ({
          symbol: s.symbol,
          livePositions: s.openPositions || 0,
          profitFactor250: s.profitFactor250 || 0,
          profitFactor50: s.profitFactor50 || 0,
        }))
        setSymbols(symbolsList)
      }

      // Parse strategy metrics from progression data (simplified)
      const strategiesData: StrategyMetrics[] = [
        { type: "base", count: 0, winRate: 0, drawdown: 0, drawdownHours: 0, profitFactor250: 0, profitFactor50: 0 },
        { type: "main", count: 0, winRate: 0, drawdown: 0, drawdownHours: 0, profitFactor250: 0, profitFactor50: 0 },
        { type: "real", count: 0, winRate: 0, drawdown: 0, drawdownHours: 0, profitFactor250: 0, profitFactor50: 0 },
        { type: "live", count: 0, winRate: 0, drawdown: 0, drawdownHours: 0, profitFactor250: 0, profitFactor50: 0 },
      ]
      setStrategies(strategiesData)
    } catch (err) {
      console.error("[v0] Statistics V2 load error:", err)
      setError(err instanceof Error ? err.message : "Failed to load statistics")
    } finally {
      setLoading(false)
    }
  }

  if (loading && !performance) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Performance & Statistics
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-8">Loading statistics...</CardContent>
      </Card>
    )
  }

  if (error && !performance) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Performance & Statistics
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-destructive py-8">Error: {error}</CardContent>
      </Card>
    )
  }

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Performance & Statistics
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Performance Overview - Main Widget */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Last 250 Positions */}
          <PerformanceCard
            title="Last 250 Positions"
            performance={performance?.last250Positions}
          />

          {/* Last 50 Positions */}
          <PerformanceCard
            title="Last 50 Positions"
            performance={performance?.last50Positions}
          />

          {/* Last 32 Hours */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="text-sm font-semibold text-muted-foreground">Last 32 Hours</div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Positions</span>
                <span className="font-semibold">{performance?.last32Hours.totalPositions || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Total Profit</span>
                <span className={`font-semibold ${(performance?.last32Hours.totalProfit || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {(performance?.last32Hours.totalProfit || 0).toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Profit Factor</span>
                <span className="font-semibold">{(performance?.last32Hours.profitFactor || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Strategies Overview - Strategy Types with Metrics in Smart Lines */}
        <div className="space-y-3 pt-4 border-t">
          <div className="text-sm font-semibold text-muted-foreground">Strategy Types</div>
          <div className="space-y-2">
            {strategies.map((strategy) => (
              <div key={strategy.type} className="rounded-lg border bg-card p-3">
                {/* Strategy Header with Count */}
                <div className="flex items-center justify-between pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize text-xs font-semibold">
                      {strategy.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {strategy.count} strateg{strategy.count === 1 ? "y" : "ies"}
                    </span>
                  </div>
                </div>

                {/* Evaluation Metrics Line */}
                <div className="grid grid-cols-4 gap-3 pt-2 text-xs">
                  {/* Win Rate */}
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Win Rate</span>
                    <span className="font-semibold text-sm">{(strategy.winRate * 100).toFixed(1)}%</span>
                  </div>

                  {/* Drawdown */}
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Drawdown</span>
                    <span className={`font-semibold text-sm ${strategy.drawdown > 20 ? "text-red-600" : strategy.drawdown > 10 ? "text-orange-600" : "text-green-600"}`}>
                      {strategy.drawdown.toFixed(2)}%
                    </span>
                  </div>

                  {/* Drawdown Time */}
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Drawdown Time</span>
                    <span className="font-semibold text-sm">{strategy.drawdownHours.toFixed(1)}h</span>
                  </div>

                  {/* Profit Factor Average */}
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Avg Profit Factor</span>
                    <span className={`font-semibold text-sm ${
                      (strategy.profitFactor250 + strategy.profitFactor50) / 2 >= 1.5 ? "text-green-600" :
                      (strategy.profitFactor250 + strategy.profitFactor50) / 2 >= 1.0 ? "text-blue-600" :
                      "text-red-600"
                    }`}>
                      {((strategy.profitFactor250 + strategy.profitFactor50) / 2).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Performance Breakdown Line */}
                <div className="grid grid-cols-2 gap-4 pt-3 border-t mt-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Profit Factor (Last 250)</span>
                    <span className={`font-semibold ${
                      strategy.profitFactor250 >= 1.5 ? "text-green-600" :
                      strategy.profitFactor250 >= 1.0 ? "text-blue-600" :
                      "text-red-600"
                    }`}>
                      {strategy.profitFactor250.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Profit Factor (Last 50)</span>
                    <span className={`font-semibold ${
                      strategy.profitFactor50 >= 1.5 ? "text-green-600" :
                      strategy.profitFactor50 >= 1.0 ? "text-blue-600" :
                      "text-red-600"
                    }`}>
                      {strategy.profitFactor50.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Symbols Overview - Compact 22 Symbols */}
        {symbols.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-muted-foreground">Symbols ({symbols.length})</div>
            <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {symbols.map((symbol) => (
                <div
                  key={symbol.symbol}
                  className="rounded-lg border bg-card p-2 space-y-1 hover:bg-accent transition-colors"
                >
                  <div className="text-xs font-semibold truncate">{symbol.symbol}</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Pos:</span>
                    <span className="font-semibold">{symbol.livePositions}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs pt-1 border-t">
                    <div>
                      <div className="text-muted-foreground text-xs">PF250</div>
                      <div className="font-semibold">{symbol.profitFactor250.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">PF50</div>
                      <div className="font-semibold">{symbol.profitFactor50.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Indications Summary - For strategies only */}
        <div className="pt-4 border-t">
          <div className="text-xs text-muted-foreground">
            Indications are shown for strategy types only. Base, Main, Real, and Live represent different strategy complexity levels.
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface PerformanceCardProps {
  title: string
  performance?: {
    total: number
    winning: number
    losing: number
    winRate: number
    profitFactor: number
    totalProfit: number
  }
}

function PerformanceCard({ title, performance }: PerformanceCardProps) {
  if (!performance) return null

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="text-sm font-semibold text-muted-foreground">{title}</div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm">Total</span>
          <span className="font-semibold">{performance.total}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-600" />
            Winning
          </span>
          <span className="font-semibold text-green-600">{performance.winning}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-red-600" />
            Losing
          </span>
          <span className="font-semibold text-red-600">{performance.losing}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm">Win Rate</span>
          <span className="font-semibold">{(performance.winRate * 100).toFixed(1)}%</span>
        </div>

        <div className="pt-2 border-t space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Profit Factor</span>
            <span className={`font-bold text-lg ${performance.profitFactor >= 1.5 ? "text-green-600" : performance.profitFactor >= 1.0 ? "text-yellow-600" : "text-red-600"}`}>
              {performance.profitFactor.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm">Total Profit</span>
            <span className={`font-semibold ${performance.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              {performance.totalProfit.toFixed(2)} USDT
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
