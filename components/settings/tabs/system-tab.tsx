"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Info } from "lucide-react"
import { StatisticsOverview } from "@/components/settings/statistics-overview"
import type { Settings } from "@/lib/file-storage"

interface SystemTabProps {
  settings: Settings
  handleSettingChange: (key: keyof Settings, value: any) => void
}

export function SystemTab({ settings, handleSettingChange }: SystemTabProps) {
  return (
    <Tabs defaultValue="configuration" className="space-y-4">
      {/* Settings Section Tabs */}
      <TabsList className="grid grid-cols-4 w-full bg-muted/50 p-1">
        <TabsTrigger value="configuration">Core Config</TabsTrigger>
        <TabsTrigger value="data">Data Handling</TabsTrigger>
        <TabsTrigger value="engine">Trade Engine</TabsTrigger>
        <TabsTrigger value="database">Database</TabsTrigger>
      </TabsList>

      {/* Core Configuration Section */}
      <TabsContent value="configuration" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Core Engine Configuration</CardTitle>
            <CardDescription>Main trading parameters and engine settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Main Engine Interval (ms)</Label>
                <span className="text-sm font-medium">{settings.mainEngineIntervalMs || 1000}ms</span>
              </div>
              <Slider
                min={100}
                max={5000}
                step={100}
                value={[settings.mainEngineIntervalMs || 1000]}
                onValueChange={([value]) => handleSettingChange("mainEngineIntervalMs", value)}
              />
              <p className="text-xs text-muted-foreground">
                Time between main engine execution cycles (100ms - 5s)
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
              <Label htmlFor="autostart">Auto-Start Trade Engines</Label>
              <Switch
                id="autostart"
                checked={settings.autoStartTradeEngines !== false}
                onCheckedChange={(checked) => handleSettingChange("autoStartTradeEngines", checked)}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
              <Label htmlFor="debug">Debug Logging</Label>
              <Switch
                id="debug"
                checked={settings.debugLogging === true}
                onCheckedChange={(checked) => handleSettingChange("debugLogging", checked)}
              />
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label>Main Trading Symbols</Label>
              <Input
                placeholder="Enter symbols (comma-separated)"
                value={settings.mainSymbols?.join(", ") || ""}
                onChange={(e) => handleSettingChange("mainSymbols", e.target.value.split(",").map(s => s.trim()))}
              />
              <p className="text-xs text-muted-foreground">Primary symbols for analysis and trading</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Data Handling Section */}
      <TabsContent value="data" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Data & Historical Settings</CardTitle>
            <CardDescription>Configure data retention and handling policies</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Market Data Retention (Days)</Label>
              <Select
                value={String(settings.market_data_retention_days || 30)}
                onValueChange={(value) => handleSettingChange("market_data_retention_days", Number.parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Historical market data older than this will be removed</p>
            </div>

            <div className="space-y-2">
              <Label>Indication State Retention (Hours)</Label>
              <Select
                value={String(settings.indication_state_retention_hours || 48)}
                onValueChange={(value) =>
                  handleSettingChange("indication_state_retention_hours", Number.parseInt(value))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="48">48 hours</SelectItem>
                  <SelectItem value="72">72 hours</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Old indication states older than this will be removed</p>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
              <Label htmlFor="archive">Auto-Archive Historical Data</Label>
              <Switch
                id="archive"
                checked={settings.autoArchiveData === true}
                onCheckedChange={(checked) => handleSettingChange("autoArchiveData", checked)}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Trade Engine Section */}
      <TabsContent value="engine" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Trade Engine Parameters</CardTitle>
            <CardDescription>Configure trading engine behavior and strategies</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Max Concurrent Trades</Label>
                <span className="text-sm font-medium">{settings.maxConcurrentTrades || 5}</span>
              </div>
              <Slider
                min={1}
                max={20}
                step={1}
                value={[settings.maxConcurrentTrades || 5]}
                onValueChange={([value]) => handleSettingChange("maxConcurrentTrades", value)}
              />
              <p className="text-xs text-muted-foreground">Maximum number of simultaneous active trades</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Position Size (% of Balance)</Label>
                <span className="text-sm font-medium">{settings.positionSizePercent || 10}%</span>
              </div>
              <Slider
                min={0.5}
                max={50}
                step={0.5}
                value={[settings.positionSizePercent || 10]}
                onValueChange={([value]) => handleSettingChange("positionSizePercent", value)}
              />
              <p className="text-xs text-muted-foreground">Risk per trade as percentage of account balance</p>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
              <Label htmlFor="stop-loss">Use Fixed Stop Loss</Label>
              <Switch
                id="stop-loss"
                checked={settings.useFixedStopLoss === true}
                onCheckedChange={(checked) => handleSettingChange("useFixedStopLoss", checked)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Stop Loss % (if enabled)</Label>
                <span className="text-sm font-medium">{settings.fixedStopLossPercent || 2}%</span>
              </div>
              <Slider
                min={0.1}
                max={10}
                step={0.1}
                value={[settings.fixedStopLossPercent || 2]}
                onValueChange={([value]) => handleSettingChange("fixedStopLossPercent", value)}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Database Section */}
      <TabsContent value="database" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Database Configuration</CardTitle>
            <CardDescription>Core system settings, database management, and application logs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Database Type</h3>
              <p className="text-xs text-muted-foreground">
                The system uses Redis for high-performance in-memory data storage.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Database Engine</Label>
                  <div className="flex items-center gap-3 p-4 border rounded-lg bg-primary/5">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <div>
                      <p className="font-semibold text-lg">Redis</p>
                      <p className="text-xs text-muted-foreground">In-Memory Data Store</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong>Redis</strong> provides high-performance data storage with millisecond latency,
                    perfect for real-time trading applications.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Connection Status</Label>
                  <div className="p-3 border rounded-lg bg-muted/30">
                    <p className="text-sm">
                      <strong>Mode:</strong> {settings.databaseType === "redis" ? "Persistent Redis" : "In-Memory Fallback"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure REDIS_URL environment variable for persistent storage.
                      Without it, data will be stored in-memory and lost on restart.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h3 className="text-lg font-semibold">Database Statistics</h3>
              <StatisticsOverview settings={settings} />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
