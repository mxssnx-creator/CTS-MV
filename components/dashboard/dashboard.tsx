"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SystemOverview } from "@/components/dashboard/system-overview"
import { GlobalTradeEngineControls } from "@/components/dashboard/global-trade-engine-controls"
import { StrategiesOverview } from "@/components/dashboard/strategies-overview"
import { CompactTradingOverview } from "@/components/dashboard/compact-trading-overview"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth-context"
import { RefreshCw } from "lucide-react"

export function Dashboard() {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      // Simulate loading
      await new Promise(resolve => setTimeout(resolve, 500))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <div>
            <h1 className="text-3xl font-bold">CTS v3.2 Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {user?.username || "Administrator"}</p>
          </div>
        </div>
        <Button onClick={handleRefresh} disabled={isLoading} size="sm">
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* System Overview */}
      <SystemOverview />

      {/* Global Controls */}
      <GlobalTradeEngineControls />

      {/* Trading Overview */}
      <CompactTradingOverview />

      {/* Strategies */}
      <StrategiesOverview />
    </div>
  )
}
