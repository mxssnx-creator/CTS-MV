"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Info } from "lucide-react"
import { StatisticsOverview } from "@/components/settings/statistics-overview"

interface SystemTabProps {
  settings: any
  handleSettingChange: (key: string, value: any) => void
}

export function SystemTab({ settings, handleSettingChange }: SystemTabProps) {
  return (
    <Tabs defaultValue="system" className="space-y-4">
      <TabsContent value="system" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>System Configuration</CardTitle>
            <CardDescription>Core system settings, database management, and application logs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Database Configuration</h3>
              <p className="text-xs text-muted-foreground">
                The system uses Redis for high-performance in-memory data storage.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Database Type</Label>
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
              <h3 className="text-lg font-semibold">Data Retention Settings</h3>
              <p className="text-xs text-muted-foreground">Configure automatic cleanup of old data</p>

              <div className="grid md:grid-cols-2 gap-4">
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
