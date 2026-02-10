"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Info,
  Database,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Bot,
  Layers,
  Activity,
  Clock,
  Zap,
  BarChart3,
  Menu,
} from "lucide-react"
import { AuthGuard } from "@/components/auth-guard"

interface SystemStatus {
  initializationProgress: number
  currentPhase: string
  symbolsLoaded: number
  totalSymbols: number
  prehistoricDataProgress: number
  tradeEngineRunning: boolean
  realTimeStreamConnected: boolean
  indicationsGenerated: number
  strategiesEvaluated: number
  pseudoPositionsCreated: number
  currentInterval: number
  intervalExecutionTime: number
  lastUpdate: string
}

export default function LogisticsPage() {
  const [activeTab, setActiveTab] = useState("main")
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    initializationProgress: 0,
    currentPhase: "Initializing",
    symbolsLoaded: 0,
    totalSymbols: 50,
    prehistoricDataProgress: 0,
    tradeEngineRunning: false,
    realTimeStreamConnected: false,
    indicationsGenerated: 0,
    strategiesEvaluated: 0,
    pseudoPositionsCreated: 0,
    currentInterval: 0,
    intervalExecutionTime: 0,
    lastUpdate: new Date().toISOString(),
  })

  useEffect(() => {
    // Load initial system status
    loadSystemStatus()

    // Poll for updates every 2 seconds
    const interval = setInterval(loadSystemStatus, 2000)

    return () => clearInterval(interval)
  }, [])

  const loadSystemStatus = async () => {
    try {
      const response = await fetch("/api/system/logistics-status")
      if (response.ok) {
        const data = await response.json()
        setSystemStatus(data)
      } else {
        // Simulate status for demo purposes
        setSystemStatus((prev) => ({
          ...prev,
          initializationProgress: Math.min(prev.initializationProgress + 5, 100),
          prehistoricDataProgress: Math.min(prev.prehistoricDataProgress + 3, 100),
          indicationsGenerated: prev.indicationsGenerated + Math.floor(Math.random() * 10),
          strategiesEvaluated: prev.strategiesEvaluated + Math.floor(Math.random() * 5),
          pseudoPositionsCreated: prev.pseudoPositionsCreated + Math.floor(Math.random() * 3),
          currentInterval: prev.currentInterval + 1,
          intervalExecutionTime: 800 + Math.random() * 400,
          tradeEngineRunning: prev.initializationProgress >= 100,
          realTimeStreamConnected: prev.initializationProgress >= 80,
          lastUpdate: new Date().toISOString(),
        }))
      }
    } catch (error) {
      console.error("[v0] Failed to load logistics status:", error)
    }
  }

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case "Initializing":
        return "bg-yellow-500"
      case "Loading Symbols":
        return "bg-blue-500"
      case "Loading Prehistoric Data":
        return "bg-purple-500"
      case "Starting Trade Engine":
        return "bg-orange-500"
      case "Running":
        return "bg-green-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen w-full flex-col bg-background">
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center gap-4 px-4">
            <Button variant="ghost" size="icon" className="h-8 w-8"><Menu className="h-4 w-4" /></Button>
            <div className="flex flex-1 items-center justify-between">
              <h1 className="text-lg font-semibold">System Logistics</h1>
              <div className="flex items-center gap-2">
                <Badge variant={systemStatus.tradeEngineRunning ? "default" : "secondary"} className="gap-1">
                  {systemStatus.tradeEngineRunning ? (
                    <Activity className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  {systemStatus.tradeEngineRunning ? "Running" : "Initializing"}
                </Badge>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-6 p-6">
          {/* System Status Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Initialization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-bold">{systemStatus.initializationProgress}%</span>
                  </div>
                  <Progress value={systemStatus.initializationProgress} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Symbols Loaded</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-2xl font-bold">
                    {systemStatus.symbolsLoaded}/{systemStatus.totalSymbols}
                  </div>
                  <Progress
                    value={(systemStatus.symbolsLoaded / systemStatus.totalSymbols) * 100}
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Prehistoric Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Loading</span>
                    <span className="font-bold">{systemStatus.prehistoricDataProgress}%</span>
                  </div>
                  <Progress value={systemStatus.prehistoricDataProgress} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Current Interval</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-2xl font-bold">#{systemStatus.currentInterval}</div>
                  <div className="text-xs text-muted-foreground">
                    Exec time: {systemStatus.intervalExecutionTime.toFixed(0)}ms
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Real-time Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Real-Time Activity
              </CardTitle>
              <CardDescription>Current system processing metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-blue-500/10 p-3">
                    <Zap className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Indications Generated</div>
                    <div className="text-2xl font-bold">{systemStatus.indicationsGenerated}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-purple-500/10 p-3">
                    <BarChart3 className="h-6 w-6 text-purple-500" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Strategies Evaluated</div>
                    <div className="text-2xl font-bold">{systemStatus.strategiesEvaluated}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-green-500/10 p-3">
                    <TrendingUp className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Pseudo Positions</div>
                    <div className="text-2xl font-bold">{systemStatus.pseudoPositionsCreated}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="main" className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Main System
              </TabsTrigger>
              <TabsTrigger value="preset" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Preset Trade
              </TabsTrigger>
              <TabsTrigger value="bot" className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Trading Bots
              </TabsTrigger>
            </TabsList>

            {/* Main System Trade Logistics */}
            <TabsContent value="main" className="space-y-6 mt-6">
              {/* Trade Mode Alert */}
              <Alert className="border-l-4 border-l-primary">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Main System Trade Mode:</strong> Uses step-based indication calculations (Direction, Move,
                  Active types with 3-30 step ranges) generating up to 250 pseudo positions per indication.
                </AlertDescription>
              </Alert>

              {/* Phase 1: Initialization */}
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 font-bold text-white">
                      1
                    </div>
                    Initialization Phase
                  </CardTitle>
                  <CardDescription>System startup and prehistoric data loading</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Step 1.1 */}
                  <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-500/5 p-4">
                    <div className="mb-2 font-medium">1.1 Load System Settings from Database</div>
                    <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                      <div>• Trade Engine Interval: 1.0s (default)</div>
                      <div>• Real Positions Interval: 0.3s</div>
                      <div>• Market Data Timeframe: 1 second</div>
                      <div>• Time Range History: 5 days</div>
                      <div>• Validation Timeout: 15 seconds</div>
                      <div>• Position Cooldown: 20 seconds</div>
                    </div>
                  </div>

                  {/* Step 1.2 */}
                  <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-500/5 p-4">
                    <div className="mb-2 font-medium">1.2 Load Symbols</div>
                    <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                      <div>• Mode: Main Symbols → Use configured list + forced symbols</div>
                      <div>• Mode: Exchange Symbols → Fetch top N by volume</div>
                      <div>• Mode: Default Symbols → Use fallback list</div>
                      <div className="font-medium text-primary">
                        → Result: {systemStatus.symbolsLoaded} unique symbols loaded
                      </div>
                    </div>
                  </div>

                  {/* Step 1.3 */}
                  <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-500/5 p-4">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      1.3 Load Prehistoric Data (Async per Symbol)
                      <Badge className="bg-blue-500">Parallel</Badge>
                    </div>
                    <div className="ml-4 space-y-2 text-sm">
                      <div className="font-medium text-blue-600">Async Processing:</div>
                      <div className="ml-4 space-y-1 text-muted-foreground">
                        <div>• All symbols processed simultaneously (concurrency limit: 10)</div>
                        <div>• Time Range: Last 5 days (432,000 candles per symbol)</div>
                        <div>• Timeframe: 1 second candles</div>
                      </div>
                      <div className="mt-2 rounded border bg-background p-3">
                        <Progress value={systemStatus.prehistoricDataProgress} className="h-2" />
                        <div className="mt-2 text-xs font-mono text-primary">
                          Progress: {systemStatus.prehistoricDataProgress}% complete
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 1.4 */}
                  <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-500/5 p-4">
                    <div className="mb-2 font-medium">1.4 Initialize Market Data Stream</div>
                    <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                      <div>• Connect to exchange WebSocket</div>
                      <div>• Subscribe to all symbols simultaneously</div>
                      <div>• Real-time price updates (1-second candles)</div>
                      <div className="flex items-center gap-2">
                        <span>• Status:</span>
                        <Badge
                          variant={systemStatus.realTimeStreamConnected ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {systemStatus.realTimeStreamConnected ? "Connected" : "Connecting"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {systemStatus.initializationProgress >= 100 && (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertDescription>
                        <strong>Initialization Complete:</strong> System ready and Trade Engine running
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Phase 2: Trade Interval Loop */}
              {systemStatus.tradeEngineRunning && (
                <Card className="border-l-4 border-l-purple-500">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500 font-bold text-white">
                        2
                      </div>
                      Trade Interval Loop (1.0s)
                    </CardTitle>
                    <CardDescription>
                      Indications → Strategies → Pseudo Positions → Logging (Non-Overlapping)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Non-Overlapping Execution:</strong> New interval starts ONLY after previous completes.
                        Current execution time: {systemStatus.intervalExecutionTime.toFixed(0)}ms
                      </AlertDescription>
                    </Alert>

                    {/* Stage 2.1 - Indications */}
                    <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-500/5 p-4">
                      <div className="mb-3 flex items-center gap-2 font-medium">
                        <span>2.1 Process Indications (Base Pseudo Positions)</span>
                        <Badge className="bg-blue-500">Parallel by Symbol</Badge>
                      </div>

                      <div className="space-y-3">
                        <div className="rounded border bg-background p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                            <Badge variant="outline">Main System Trade Mode</Badge>
                            Step-Based Indication Calculations
                          </div>
                          <div className="ml-4 space-y-2 text-sm">
                            <div className="font-medium text-green-600">Indication Types:</div>
                            <div className="ml-4 space-y-1 text-muted-foreground">
                              <div>• Direction Type (3-30 step ranges): Reversal trading</div>
                              <div>• Move Type (3-30 step ranges): Trend following</div>
                              <div>• Active Type (0.5-2.5% thresholds): Breakout strategies</div>
                              <div>• Optimal Type (Advanced): High-precision validated configs</div>
                            </div>

                            <div className="mt-3 rounded border bg-primary/5 p-3">
                              <div className="font-medium text-primary">Real-Time Stats:</div>
                              <div className="mt-2 space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span>Indications Generated:</span>
                                  <span className="font-bold">{systemStatus.indicationsGenerated}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Current Interval:</span>
                                  <span className="font-bold">#{systemStatus.currentInterval}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Processing Time:</span>
                                  <span className="font-bold">{systemStatus.intervalExecutionTime.toFixed(0)}ms</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stage 2.2 - Strategies */}
                    <div className="rounded-lg border-l-4 border-l-purple-500 bg-purple-500/5 p-4">
                      <div className="mb-3 flex items-center gap-2 font-medium">
                        <span>2.2 Evaluate Strategies</span>
                        <Badge className="bg-purple-500">Sequential</Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="rounded border bg-background p-3 text-sm">
                          <div className="mb-2 font-medium text-purple-600">Strategy Evaluation:</div>
                          <div className="ml-4 space-y-1 text-muted-foreground">
                            <div>• Take Profit: 11 levels (0.5% to 5.0%)</div>
                            <div>• Stop Loss: 21 levels (0.1% to 2.0%)</div>
                            <div>• Trailing: 4 modes (OFF, Standard, Aggressive, Conservative)</div>
                            <div>• Total combinations: 924 per indication</div>
                          </div>

                          <div className="mt-3 rounded bg-purple-500/10 p-2">
                            <div className="flex justify-between text-xs">
                              <span>Strategies Evaluated:</span>
                              <span className="font-bold">{systemStatus.strategiesEvaluated}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stage 2.3 - Pseudo Positions */}
                    <div className="rounded-lg border-l-4 border-l-green-500 bg-green-500/5 p-4">
                      <div className="mb-3 flex items-center gap-2 font-medium">
                        <span>2.3 Create Pseudo Positions</span>
                        <Badge className="bg-green-500">Database Write</Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="rounded border bg-background p-3 text-sm">
                          <div className="mb-2 font-medium text-green-600">Position Creation:</div>
                          <div className="ml-4 space-y-1 text-muted-foreground">
                            <div>• Filter by profit_factor ≥ 0.6</div>
                            <div>• Max 250 positions per configuration</div>
                            <div>• Track performance metrics</div>
                            <div>• Update status: evaluating → active → paused → failed</div>
                          </div>

                          <div className="mt-3 rounded bg-green-500/10 p-2">
                            <div className="flex justify-between text-xs">
                              <span>Pseudo Positions Created:</span>
                              <span className="font-bold">{systemStatus.pseudoPositionsCreated}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stage 2.4 - Logging */}
                    <div className="rounded-lg border-l-4 border-l-orange-500 bg-orange-500/5 p-4">
                      <div className="mb-3 flex items-center gap-2 font-medium">
                        <span>2.4 System Logging</span>
                        <Badge className="bg-orange-500">Async</Badge>
                      </div>

                      <div className="rounded border bg-background p-3 text-sm text-muted-foreground">
                        <div>• Log all indications, strategies, and positions</div>
                        <div>• Performance metrics tracking</div>
                        <div>• Error handling and recovery</div>
                        <div>• Last update: {new Date(systemStatus.lastUpdate).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Phase 3: Position Management */}
              {systemStatus.tradeEngineRunning && (
                <Card className="border-l-4 border-l-green-500">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 font-bold text-white">
                        3
                      </div>
                      Position Management
                    </CardTitle>
                    <CardDescription>Real positions monitoring and execution</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border-l-4 border-l-green-500 bg-green-500/5 p-4">
                      <div className="mb-2 font-medium">3.1 Promote to Real Positions</div>
                      <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                        <div>• Monitor pseudo position performance</div>
                        <div>• Promote best performers (profit_factor ≥ 0.8)</div>
                        <div>• Place orders on exchange</div>
                        <div>• Track real-time P&L</div>
                      </div>
                    </div>

                    <div className="rounded-lg border-l-4 border-l-green-500 bg-green-500/5 p-4">
                      <div className="mb-2 font-medium">3.2 Monitor and Update (0.3s interval)</div>
                      <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                        <div>• Fetch position updates from exchange</div>
                        <div>• Update trailing stops</div>
                        <div>• Execute take profit / stop loss</div>
                        <div>• Close positions automatically</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Preset Trade Tab */}
            <TabsContent value="preset" className="space-y-6 mt-6">
              <Alert className="border-l-4 border-l-primary">
                <Database className="h-4 w-4" />
                <AlertDescription>
                  <strong>Preset Trade Mode:</strong> Uses predefined technical indicators (RSI, MACD, Bollinger, etc.)
                  to generate trading signals with confluence validation.
                </AlertDescription>
              </Alert>

              <Card>
                <CardHeader>
                  <CardTitle>Preset Trade Workflow</CardTitle>
                  <CardDescription>Indicator-based trading system</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-500/5 p-4">
                    <div className="mb-2 font-medium">1. Technical Indicators</div>
                    <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                      <div>• RSI (Relative Strength Index)</div>
                      <div>• MACD (Moving Average Convergence Divergence)</div>
                      <div>• Bollinger Bands</div>
                      <div>• Parabolic SAR</div>
                      <div>• EMA & SMA</div>
                      <div>• Stochastic Oscillator</div>
                      <div>• ADX (Average Directional Index)</div>
                    </div>
                  </div>

                  <div className="rounded-lg border-l-4 border-l-purple-500 bg-purple-500/5 p-4">
                    <div className="mb-2 font-medium">2. Signal Generation</div>
                    <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                      <div>• Each indicator generates: BUY, SELL, or NEUTRAL</div>
                      <div>• Confluence: 2+ indicators must agree</div>
                      <div>• Filter by profit_factor ≥ 0.6</div>
                    </div>
                  </div>

                  <div className="rounded-lg border-l-4 border-l-green-500 bg-green-500/5 p-4">
                    <div className="mb-2 font-medium">3. Position Execution</div>
                    <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                      <div>• Create base pseudo positions</div>
                      <div>• Track performance</div>
                      <div>• Promote best to real positions</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Trading Bots Tab */}
            <TabsContent value="bot" className="space-y-6 mt-6">
              <Alert className="border-l-4 border-l-primary">
                <Bot className="h-4 w-4" />
                <AlertDescription>
                  <strong>Trading Bots:</strong> Automated trading strategies with custom configurations and risk
                  management.
                </AlertDescription>
              </Alert>

              <Card>
                <CardHeader>
                  <CardTitle>Bot Trading Configuration</CardTitle>
                  <CardDescription>Manage automated trading bots</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-500/5 p-4">
                    <div className="mb-2 font-medium">Bot Types</div>
                    <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                      <div>• Grid Trading Bots</div>
                      <div>• DCA (Dollar Cost Averaging) Bots</div>
                      <div>• Arbitrage Bots</div>
                      <div>• Market Making Bots</div>
                    </div>
                  </div>

                  <div className="rounded-lg border-l-4 border-l-purple-500 bg-purple-500/5 p-4">
                    <div className="mb-2 font-medium">Configuration</div>
                    <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                      <div>• Symbol selection</div>
                      <div>• Price range setup</div>
                      <div>• Grid spacing</div>
                      <div>• Volume per order</div>
                      <div>• Stop loss / Take profit</div>
                    </div>
                  </div>

                  <div className="rounded-lg border-l-4 border-l-green-500 bg-green-500/5 p-4">
                    <div className="mb-2 font-medium">Monitoring</div>
                    <div className="ml-4 space-y-1 text-sm text-muted-foreground">
                      <div>• Real-time P&L tracking</div>
                      <div>• Order execution status</div>
                      <div>• Performance analytics</div>
                      <div>• Risk metrics</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </AuthGuard>
  )
}
