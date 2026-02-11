"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IndicationBar } from "@/components/indications/indication-bar"
import { IndicationFilters } from "@/components/indications/indication-filters"
import { Activity, TrendingUp, BarChart3, Settings, RefreshCw, AlertTriangle } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import { useExchange } from "@/lib/exchange-context"
import { PageHeader } from "@/components/page-header"

export default function IndicationsPage() {
  const { selectedExchange } = useExchange()
  const [activeTab, setActiveTab] = useState("overview")
  const [hasRealConnections, setHasRealConnections] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [minimalProfitFactor, setMinimalProfitFactor] = useState(0.5)
  const [filters, setFilters] = useState({
    type: [] as string[],
    rangeMin: 3,
    rangeMax: 30,
    profitFactorMin: 0.5,
    symbolFilter: "",
    trailingFilter: "no" as "no" | "yes" | "only",
    adjustBlock: "no" as "no" | "yes" | "only",
    adjustDca: "no" as "no" | "yes" | "only",
    activeOnly: false,
  })

  const [indications, setIndications] = useState([
    {
      id: "dir-btc-15",
      type: "direction" as const,
      symbol: "BTCUSDT",
      range: 15,
      isActive: true,
      profitFactor: 0.75,
      stats: {
        last8Avg: 0.82,
        last20Avg: 0.71,
        last50Avg: 0.68,
        positionsPerDay: 12,
        drawdownHours: 4.2,
      },
      subConfigurations: [
        {
          id: "dir-btc-15-tp8-sl0.5",
          takeProfitFactor: 8,
          stopLossRatio: 0.5,
          trailingEnabled: false,
          blockEnabled: false,
          dcaEnabled: false,
          profitFactor: 0.85,
          isActive: true,
        },
        {
          id: "dir-btc-15-tp12-sl0.8-trail",
          takeProfitFactor: 12,
          stopLossRatio: 0.8,
          trailingEnabled: true,
          blockEnabled: true,
          dcaEnabled: false,
          profitFactor: 0.92,
          isActive: true,
        },
      ],
    },
    {
      id: "move-eth-8",
      type: "move" as const,
      symbol: "ETHUSDT",
      range: 8,
      isActive: false,
      profitFactor: 0.42,
      stats: {
        last8Avg: 0.38,
        last20Avg: 0.45,
        last50Avg: 0.41,
        positionsPerDay: 18,
        drawdownHours: 6.8,
      },
      subConfigurations: [
        {
          id: "move-eth-8-tp6-sl0.4",
          takeProfitFactor: 6,
          stopLossRatio: 0.4,
          trailingEnabled: false,
          blockEnabled: false,
          dcaEnabled: true,
          profitFactor: 0.45,
          isActive: false,
        },
      ],
    },
    {
      id: "active-xrp-5",
      type: "active" as const,
      symbol: "XRPUSDT",
      range: 5,
      isActive: true,
      profitFactor: 1.24,
      stats: {
        last8Avg: 1.31,
        last20Avg: 1.18,
        last50Avg: 1.15,
        positionsPerDay: 25,
        drawdownHours: 2.1,
      },
      subConfigurations: [
        {
          id: "active-xrp-5-tp10-sl0.6-all",
          takeProfitFactor: 10,
          stopLossRatio: 0.6,
          trailingEnabled: true,
          blockEnabled: true,
          dcaEnabled: true,
          profitFactor: 1.28,
          isActive: true,
        },
      ],
    },
    {
      id: "dir-bch-20",
      type: "direction" as const,
      symbol: "BCHUSDT",
      range: 20,
      isActive: true,
      profitFactor: 0.89,
      stats: {
        last8Avg: 0.95,
        last20Avg: 0.87,
        last50Avg: 0.83,
        positionsPerDay: 8,
        drawdownHours: 3.5,
      },
      subConfigurations: [
        {
          id: "dir-bch-20-tp15-sl0.7",
          takeProfitFactor: 15,
          stopLossRatio: 0.7,
          trailingEnabled: false,
          blockEnabled: true,
          dcaEnabled: false,
          profitFactor: 0.91,
          isActive: true,
        },
      ],
    },
  ])

  useEffect(() => {
    const loadIndications = async () => {
      try {
        const response = await fetch("/api/settings/connections")
        const data = await response.json()
        const activeConnections = data.connections?.filter((c: any) => c.is_enabled) || []
        setHasRealConnections(activeConnections.length > 0)

        if (activeConnections.length === 0) {
          // Use mock data only when no connections exist
          setIndications([
            {
              id: "dir-btc-15",
              type: "direction" as const,
              symbol: "BTCUSDT",
              range: 15,
              isActive: true,
              profitFactor: 0.75,
              stats: {
                last8Avg: 0.82,
                last20Avg: 0.71,
                last50Avg: 0.68,
                positionsPerDay: 12,
                drawdownHours: 4.2,
              },
              subConfigurations: [
                {
                  id: "dir-btc-15-tp8-sl0.5",
                  takeProfitFactor: 8,
                  stopLossRatio: 0.5,
                  trailingEnabled: false,
                  blockEnabled: false,
                  dcaEnabled: false,
                  profitFactor: 0.85,
                  isActive: true,
                },
                {
                  id: "dir-btc-15-tp12-sl0.8-trail",
                  takeProfitFactor: 12,
                  stopLossRatio: 0.8,
                  trailingEnabled: true,
                  blockEnabled: true,
                  dcaEnabled: false,
                  profitFactor: 0.92,
                  isActive: true,
                },
              ],
            },
            {
              id: "move-eth-8",
              type: "move" as const,
              symbol: "ETHUSDT",
              range: 8,
              isActive: false,
              profitFactor: 0.42,
              stats: {
                last8Avg: 0.38,
                last20Avg: 0.45,
                last50Avg: 0.41,
                positionsPerDay: 18,
                drawdownHours: 6.8,
              },
              subConfigurations: [
                {
                  id: "move-eth-8-tp6-sl0.4",
                  takeProfitFactor: 6,
                  stopLossRatio: 0.4,
                  trailingEnabled: false,
                  blockEnabled: false,
                  dcaEnabled: true,
                  profitFactor: 0.45,
                  isActive: false,
                },
              ],
            },
            {
              id: "active-xrp-5",
              type: "active" as const,
              symbol: "XRPUSDT",
              range: 5,
              isActive: true,
              profitFactor: 1.24,
              stats: {
                last8Avg: 1.31,
                last20Avg: 1.18,
                last50Avg: 1.15,
                positionsPerDay: 25,
                drawdownHours: 2.1,
              },
              subConfigurations: [
                {
                  id: "active-xrp-5-tp10-sl0.6-all",
                  takeProfitFactor: 10,
                  stopLossRatio: 0.6,
                  trailingEnabled: true,
                  blockEnabled: true,
                  dcaEnabled: true,
                  profitFactor: 1.28,
                  isActive: true,
                },
              ],
            },
            {
              id: "dir-bch-20",
              type: "direction" as const,
              symbol: "BCHUSDT",
              range: 20,
              isActive: true,
              profitFactor: 0.89,
              stats: {
                last8Avg: 0.95,
                last20Avg: 0.87,
                last50Avg: 0.83,
                positionsPerDay: 8,
                drawdownHours: 3.5,
              },
              subConfigurations: [
                {
                  id: "dir-bch-20-tp15-sl0.7",
                  takeProfitFactor: 15,
                  stopLossRatio: 0.7,
                  trailingEnabled: false,
                  blockEnabled: true,
                  dcaEnabled: false,
                  profitFactor: 0.91,
                  isActive: true,
                },
              ],
            },
          ])
        } else {
          // Fetch real indications from API
          const indicationsResponse = await fetch("/api/indications")
          if (indicationsResponse.ok) {
            const indicationsData = await indicationsResponse.json()
            setIndications(indicationsData.indications || [])
          }
        }
      } catch (error) {
        console.error("Failed to load indications:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadIndications()
  }, [])

  const handleToggleIndication = (id: string, active: boolean) => {
    setIndications((prev) => prev.map((ind) => (ind.id === id ? { ...ind, isActive: active } : ind)))
    toast.success(`Indication ${active ? "activated" : "deactivated"}`)
  }

  const filteredIndications = indications.filter((indication) => {
    if (filters.type.length > 0 && !filters.type.includes(indication.type)) return false
    if (indication.range < filters.rangeMin || indication.range > filters.rangeMax) return false
    if (indication.profitFactor < filters.profitFactorMin) return false
    if (filters.symbolFilter && !indication.symbol.toLowerCase().includes(filters.symbolFilter.toLowerCase()))
      return false
    if (filters.activeOnly && !indication.isActive) return false

    const hasTrailing = indication.subConfigurations?.some((sub) => sub.trailingEnabled)
    const hasBlock = indication.subConfigurations?.some((sub) => sub.blockEnabled)
    const hasDca = indication.subConfigurations?.some((sub) => sub.dcaEnabled)

    if (filters.trailingFilter === "only" && !hasTrailing) return false
    if (filters.trailingFilter === "yes" && hasTrailing) return true
    if (filters.trailingFilter === "no" && hasTrailing) return false

    if (filters.adjustBlock === "only" && !hasBlock) return false
    if (filters.adjustBlock === "yes" && hasBlock) return true
    if (filters.adjustBlock === "no" && hasBlock) return false

    if (filters.adjustDca === "only" && !hasDca) return false
    if (filters.adjustDca === "yes" && hasDca) return true
    if (filters.adjustDca === "no" && hasDca) return false

    return true
  })

  const activeIndications = indications.filter((ind) => ind.isActive)
  const profitableIndications = indications.filter((ind) => ind.profitFactor >= minimalProfitFactor)

  const stats = {
    total: indications.length,
    active: activeIndications.length,
    profitable: profitableIndications.length,
    avgProfitFactor: indications.reduce((sum, ind) => sum + ind.profitFactor, 0) / indications.length,
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-muted-foreground">Loading indications...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Indications</h1>
          <p className="text-muted-foreground">Configure and monitor trading indications</p>
        </div>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Warning Banner */}
      {!hasRealConnections && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <div>
              <div className="font-semibold text-yellow-700 dark:text-yellow-400">Using Mock Data</div>
              <div className="text-sm text-yellow-600 dark:text-yellow-500">
                No active exchange connections found. Enable a connection in Settings to see real indications.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total Indications</div>
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
              <TrendingUp className="h-5 w-5 text-purple-500" />
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
              <Settings className="h-5 w-5 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{stats.avgProfitFactor.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">Avg Profit Factor</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters */}
        <div className="lg:col-span-1">
          <IndicationFilters filters={filters} onFiltersChange={setFilters} />
        </div>

        {/* Indications List */}
        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="active">Active ({activeIndications.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Showing {filteredIndications.length} of {indications.length} indications
                  </span>
                  <Badge variant="outline">Min Profit Factor: {minimalProfitFactor}</Badge>
                </div>
              </div>

              <div className="space-y-3">
                {filteredIndications.map((indication) => (
                  <IndicationBar
                    key={indication.id}
                    indication={indication}
                    onToggle={handleToggleIndication}
                    minimalProfitFactor={minimalProfitFactor}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="active" className="space-y-4">
              <div className="space-y-3">
                {activeIndications.map((indication) => (
                  <IndicationBar
                    key={indication.id}
                    indication={indication}
                    onToggle={handleToggleIndication}
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
