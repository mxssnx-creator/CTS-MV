"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Save } from "lucide-react"
import { toast } from "@/lib/simple-toast"

interface ConnectionSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  connectionName: string
}

interface IndicationSettings {
  indication_type: string
  indication_name: string
  is_enabled: boolean
  range?: number
  timeout?: number
  interval?: number
}

interface StrategySettings {
  strategy_type: string
  is_enabled: boolean
  min_profit_factor?: number
  max_positions?: number
}

interface ConnectionSettings {
  symbols: string[]
  order_type: "main" | "retrieving"
  volume_ratio: number
  volume_ratio_min: number
  volume_ratio_max: number
}

export function ConnectionSettingsDialog({
  open,
  onOpenChange,
  connectionId,
  connectionName,
}: ConnectionSettingsDialogProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("symbols")
  const [indications, setIndications] = useState<IndicationSettings[]>([])
  const [strategies, setStrategies] = useState<StrategySettings[]>([])
  const [settings, setSettings] = useState<ConnectionSettings>({
    symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
    order_type: "main",
    volume_ratio: 1.0,
    volume_ratio_min: 0.5,
    volume_ratio_max: 2.0,
  })
  const [symbolInput, setSymbolInput] = useState("")

  useEffect(() => {
    if (open) {
      loadSettings()
    }
  }, [open, connectionId])

  const loadSettings = async () => {
    try {
      setLoading(true)

      // Load active indications for this connection
      const indicationsRes = await fetch(`/api/settings/connections/${connectionId}/active-indications`)
      if (indicationsRes.ok) {
        const indicationsData = await indicationsRes.json()
        setIndications(indicationsData.indications || [])
      }

      // Load connection settings including strategies
      const settingsRes = await fetch(`/api/settings/connections/${connectionId}/settings`)
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        setStrategies(
          settingsData.strategies || [
            { strategy_type: "base", is_enabled: true, min_profit_factor: 1.1, max_positions: 250 },
            { strategy_type: "main", is_enabled: true, min_profit_factor: 1.15, max_positions: 250 },
            { strategy_type: "real", is_enabled: true, min_profit_factor: 1.2, max_positions: 250 },
            { strategy_type: "preset", is_enabled: false, min_profit_factor: 1.1, max_positions: 250 },
          ],
        )
        
        // Load connection-specific settings
        if (settingsData.symbols) setSettings(prev => ({ ...prev, symbols: settingsData.symbols }))
        if (settingsData.order_type) setSettings(prev => ({ ...prev, order_type: settingsData.order_type }))
        if (settingsData.volume_ratio) setSettings(prev => ({ ...prev, volume_ratio: settingsData.volume_ratio }))
        if (settingsData.volume_ratio_min) setSettings(prev => ({ ...prev, volume_ratio_min: settingsData.volume_ratio_min }))
        if (settingsData.volume_ratio_max) setSettings(prev => ({ ...prev, volume_ratio_max: settingsData.volume_ratio_max }))
      }
    } catch (error) {
      console.error("[v0] Failed to load connection settings:", error)
      toast.error("Error loading settings", {
        description: error instanceof Error ? error.message : "Failed to load settings",
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleIndication = (index: number, enabled: boolean) => {
    setIndications((prev) => prev.map((ind, i) => (i === index ? { ...ind, is_enabled: enabled } : ind)))
  }

  const toggleStrategy = (index: number, enabled: boolean) => {
    setStrategies((prev) => prev.map((strat, i) => (i === index ? { ...strat, is_enabled: enabled } : strat)))
  }

  const addSymbol = () => {
    const sym = symbolInput.toUpperCase().trim()
    if (sym && !settings.symbols.includes(sym)) {
      setSettings(prev => ({ ...prev, symbols: [...prev.symbols, sym] }))
      setSymbolInput("")
    }
  }

  const removeSymbol = (symbol: string) => {
    setSettings(prev => ({ ...prev, symbols: prev.symbols.filter(s => s !== symbol) }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // Save indication settings
      await fetch(`/api/settings/connections/${connectionId}/active-indications`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indications }),
      })

      // Save strategy settings
      await fetch(`/api/settings/connections/${connectionId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          strategies,
          symbols: settings.symbols,
          order_type: settings.order_type,
          volume_ratio: settings.volume_ratio,
          volume_ratio_min: settings.volume_ratio_min,
          volume_ratio_max: settings.volume_ratio_max,
        }),
      })

      toast.success("Settings saved", {
        description: "Connection settings have been updated successfully",
      })

      onOpenChange(false)
    } catch (error) {
      console.error("[v0] Failed to save settings:", error)
      toast.error("Save failed", {
        description: error instanceof Error ? error.message : "Failed to save settings",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connection Settings - {connectionName}</DialogTitle>
          <DialogDescription>Configure symbols, volume ratios, order type, strategies and indications</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="symbols">Symbols</TabsTrigger>
              <TabsTrigger value="volume">Volume Ratios</TabsTrigger>
              <TabsTrigger value="order">Order Type</TabsTrigger>
              <TabsTrigger value="indications">Indications</TabsTrigger>
              <TabsTrigger value="strategies">Strategies</TabsTrigger>
            </TabsList>

            {/* Symbols Tab */}
            <TabsContent value="symbols" className="space-y-4 mt-4">
              <div className="space-y-3">
                <Label className="text-base font-semibold">Exchange Symbols</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter symbol (e.g., BTCUSDT)"
                    value={symbolInput}
                    onChange={(e) => setSymbolInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        addSymbol()
                      }
                    }}
                    className="flex-1"
                  />
                  <Button onClick={addSymbol} variant="outline">
                    Add Symbol
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Active Symbols ({settings.symbols.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {settings.symbols.map((symbol) => (
                      <Badge key={symbol} variant="secondary" className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground" onClick={() => removeSymbol(symbol)}>
                        {symbol}
                        <span className="ml-1 text-xs">×</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Volume Ratios Tab */}
            <TabsContent value="volume" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="volume-ratio" className="text-base font-semibold">
                    Base Volume Ratio: {settings.volume_ratio.toFixed(2)}x
                  </Label>
                  <Input
                    id="volume-ratio"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="5"
                    value={settings.volume_ratio}
                    onChange={(e) => setSettings(prev => ({ ...prev, volume_ratio: parseFloat(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground">Multiplier for trading volume</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="volume-min" className="text-sm font-semibold">
                      Minimum Ratio: {settings.volume_ratio_min.toFixed(2)}x
                    </Label>
                    <Input
                      id="volume-min"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={settings.volume_ratio_min}
                      onChange={(e) => setSettings(prev => ({ ...prev, volume_ratio_min: parseFloat(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="volume-max" className="text-sm font-semibold">
                      Maximum Ratio: {settings.volume_ratio_max.toFixed(2)}x
                    </Label>
                    <Input
                      id="volume-max"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={settings.volume_ratio_max}
                      onChange={(e) => setSettings(prev => ({ ...prev, volume_ratio_max: parseFloat(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Order Type Tab */}
            <TabsContent value="order" className="space-y-4 mt-4">
              <div className="space-y-3">
                <Label className="text-base font-semibold">Order Type Configuration</Label>
                <Select value={settings.order_type} onValueChange={(value: any) => setSettings(prev => ({ ...prev, order_type: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Main Order</SelectItem>
                    <SelectItem value="retrieving">Retrieving Order</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  {settings.order_type === "main" 
                    ? "Main orders execute immediately when signal is triggered"
                    : "Retrieving orders wait for better prices before execution"
                  }
                </p>
              </div>
            </TabsContent>

            {/* Indications Tab */}
            <TabsContent value="indications" className="space-y-4 mt-4">
              <div className="space-y-4">
                <h3 className="text-base font-semibold">Active Indications</h3>
                {indications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No indications configured</p>
                ) : (
                  <div className="space-y-3">
                    {indications.map((indication, index) => (
                      <div
                        key={`${indication.indication_type}-${indication.indication_name}`}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Badge variant="outline" className="capitalize">
                            {indication.indication_type}
                          </Badge>
                          <div className="text-sm">
                            <div className="font-medium">{indication.indication_name}</div>
                            <div className="text-muted-foreground text-xs">
                              Range: {indication.range || "N/A"} | Timeout: {indication.timeout || "N/A"}ms
                            </div>
                          </div>
                        </div>
                        <Switch
                          checked={indication.is_enabled}
                          onCheckedChange={(checked) => toggleIndication(index, checked)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Strategies Tab */}
            <TabsContent value="strategies" className="space-y-4 mt-4">
              <div className="space-y-4">
                <h3 className="text-base font-semibold">Strategy Configuration</h3>
                <div className="space-y-3">
                  {strategies.map((strategy, index) => (
                    <div key={strategy.strategy_type} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3 flex-1">
                        <Badge variant="outline" className="capitalize">
                          {strategy.strategy_type}
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          Min PF: {strategy.min_profit_factor} | Max: {strategy.max_positions}
                        </div>
                      </div>
                      <Switch
                        checked={strategy.is_enabled}
                        onCheckedChange={(checked) => toggleStrategy(index, checked)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
