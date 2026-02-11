"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StrategyBar } from "@/components/strategies/strategy-bar"
import { StrategyFilters } from "@/components/strategies/strategy-filters"
import { StrategyEngine } from "@/lib/strategies"
import type { StrategyResult } from "@/lib/strategies"
import { Activity, TrendingUp, BarChart3, Settings, RefreshCw, Target } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import { useExchange } from "@/lib/exchange-context"
import { PageHeader } from "@/components/page-header"

export default function StrategiesPage() {
  const { selectedExchange } = useExchange()
  const [activeTab, setActiveTab] = useState("overview")
  const [minimalProfitFactor, setMinimalProfitFactor] = useState(0.4)
  const [strategies, setStrategies] = useState<StrategyResult[]>([])
  const [filters, setFilters] = useState({
    mainStrategyType: [] as string[],
    adjustmentType: [] as string[],
    validationState: [] as string[],
    profitFactorMin: 0.4,
    volumeFactorMin: 1,
    volumeFactorMax: 5,
    trailingOnly: false,
    activeOnly: false,
    minTradesPerDay: 0,
  })
  const [hasRealConnections, setHasRealConnections] = useState(false)

  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const url = selectedExchange 
          ? `/api/settings/connections?exchange=${selectedExchange}`
          : "/api/settings/connections"
        
        console.log("[v0] [Strategies] Loading connections for exchange:", selectedExchange || "all")
        const connectionsResponse = await fetch(url)
        if (connectionsResponse.ok) {
          const connectionsData = await connectionsResponse.json()
          const enabledConnections = connectionsData.connections?.filter((c: any) => c.is_enabled) || []
          setHasRealConnections(enabledConnections.length > 0)
        }

        const settingsResponse = await fetch("/api/settings")
        const settingsData = await settingsResponse.json()

        const strategyEngine = new StrategyEngine()

        if (!hasRealConnections) {
          const mockPseudoPositions = Array.from({ length: 100 }, (_, i) => ({
            id: `pseudo-${i}`,
            connection_id: "mock-connection",
            symbol: "BTCUSDT",
            indication_type: "direction" as const,
            takeprofit_factor: 8 + Math.random() * 10,
            stoploss_ratio: 0.5 + Math.random() * 1.5,
            trailing_enabled: Math.random() > 0.5,
            trail_start: 0.3 + Math.random() * 0.7,
            trail_stop: 0.1 + Math.random() * 0.2,
            entry_price: 45000 + Math.random() * 5000,
            current_price: 45000 + Math.random() * 5000,
            profit_factor: (Math.random() - 0.3) * 2,
            position_cost: 0.001,
            status: "active" as const,
            created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }))

          const generatedStrategies = strategyEngine.generateAllStrategies(
            mockPseudoPositions,
            Number.parseFloat(settingsData.blockAdjustmentRatio || "1"),
            settingsData.blockAutoDisableEnabled === "true",
            Number.parseInt(settingsData.blockAutoDisableComparisonWindow || "50"),
          )
          setStrategies(generatedStrategies)
        } else {
          console.log("[v0] Loading real strategies from API")
        }
      } catch (error) {
        console.error("[v0] Failed to load strategies:", error)
        toast.error("Failed to load strategies")
      }
    }

    loadStrategies()
  }, [selectedExchange])

  const handleToggleStrategy = (id: string, active: boolean) => {
    setStrategies((prev) => prev.map((strategy) => (strategy.id === id ? { ...strategy, isActive: active } : strategy)))
    toast.success(`Strategy ${active ? "activated" : "deactivated"}`)
  }

  const handleVolumeFactorChange = (id: string, factor: number) => {
    setStrategies((prev) =>
      prev.map((strategy) => (strategy.id === id ? { ...strategy, volume_factor: factor } : strategy)),
    )
  }

  const filteredStrategies = strategies.filter((strategy) => {
    if (
      filters.mainStrategyType.length > 0 &&
      !filters.mainStrategyType.some((type) => strategy.mainType === type.toLowerCase())
    )
      return false

    if (
      filters.adjustmentType.length > 0 &&
      !filters.adjustmentType.some((type) => strategy.adjustments.includes(type.toLowerCase() as any))
    )
      return false

    if (filters.validationState.length > 0 && !filters.validationState.includes(strategy.validation_state)) return false
    if (strategy.avg_profit_factor < filters.profitFactorMin) return false
    if (strategy.volume_factor < filters.volumeFactorMin || strategy.volume_factor > filters.volumeFactorMax)
      return false
    if (filters.trailingOnly && !strategy.config.trailing_enabled) return false
    if (filters.activeOnly && !strategy.isActive) return false
    if (strategy.stats.positions_per_day * 5 < filters.minTradesPerDay) return false

    return true
  })

  const activeStrategies = strategies.filter((strategy) => strategy.isActive)
  const validStrategies = strategies.filter((strategy) => strategy.validation_state === "valid")
  const profitableStrategies = strategies.filter((strategy) => strategy.avg_profit_factor >= minimalProfitFactor)

  const stats = {
    total: strategies.length,
    active: activeStrategies.length,
    valid: validStrategies.length,
    profitable: profitableStrategies.length,
    avgProfitFactor: strategies.reduce((sum, s) => sum + s.avg_profit_factor, 0) / strategies.length,
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {!hasRealConnections && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-yellow-500" />
            <div>
              <div className="font-semibold text-yellow-900 dark:text-yellow-100">Using Mock Data</div>
              <div className="text-sm text-yellow-700 dark:text-yellow-300">
                No active exchange connections found. Enable a connection in Settings to see real strategies.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Strategies</h1>
          <p className="text-muted-foreground">Manage and optimize trading strategies</p>
        </div>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total Strategies</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{stats.active}</div>
                <div className="text-sm text-muted-foreground">Active</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{stats.valid}</div>
                <div className="text-sm text-muted-foreground">Valid</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{stats.profitable}</div>
                <div className="text-sm text-muted-foreground">Profitable</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-cyan-500" />
              <div>
                <div className="text-2xl font-bold">{stats.avgProfitFactor.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">Avg Profit Factor</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <StrategyFilters filters={filters} onFiltersChange={setFilters} />
        </div>

        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="active">Active ({activeStrategies.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Showing {filteredStrategies.length} of {strategies.length} strategies
                  </span>
                  <Badge variant="outline">Min Profit Factor: {minimalProfitFactor}</Badge>
                </div>
              </div>

              <div className="space-y-3">
                {filteredStrategies.map((strategy) => (
                  <StrategyBar
                    key={strategy.id}
                    strategy={strategy}
                    onToggle={handleToggleStrategy}
                    onVolumeFactorChange={handleVolumeFactorChange}
                    minimalProfitFactor={minimalProfitFactor}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="active" className="space-y-4">
              <div className="space-y-3">
                {activeStrategies.map((strategy) => (
                  <StrategyBar
                    key={strategy.id}
                    strategy={strategy}
                    onToggle={handleToggleStrategy}
                    onVolumeFactorChange={handleVolumeFactorChange}
                    minimalProfitFactor={minimalProfitFactor}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
