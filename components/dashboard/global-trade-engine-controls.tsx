"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Pause, Square, Activity, Clock, Zap } from "lucide-react"
import { toast } from "@/lib/simple-toast"

interface EngineStatus {
  running: boolean
  paused: boolean
  connectedExchanges: number
  activePositions: number
  totalProfit: number
  uptime: number
  lastUpdate: Date
  cycleStats?: {
    mainEngineCycleCount: number
    presetEngineCycleCount: number
    activeOrderCycleCount: number
    avgMainCycleDuration: number
    avgPresetCycleDuration: number
    avgOrderCycleDuration: number
  }
}

export function GlobalTradeEngineControls() {
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isPausing, setIsPausing] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 2000) // Poll every 2 seconds for faster updates
    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    try {
      const response = await fetch("/api/trade-engine/status", {
        cache: "no-store", // Don't cache - always get fresh data
        headers: { "Cache-Control": "no-cache" },
      })
      if (response.ok) {
        const data = await response.json()
        console.log("[v0] [Engine Status] Loaded:", data)
        
        // Transform API response to match EngineStatus interface
        const statusData: EngineStatus = {
          running: data.running || false,
          paused: data.paused || false,
          connectedExchanges: data.connectedExchanges || 0,
          activePositions: data.activePositions || 0,
          totalProfit: data.totalProfit || 0,
          uptime: data.uptime || 0,
          lastUpdate: new Date(data.lastUpdate || Date.now()),
          cycleStats: data.cycleStats,
        }
        
        setStatus(statusData)
      }
    } catch (error) {
      console.error("[v0] Failed to load engine status:", error)
    }
  }

  const handleStart = async () => {
    console.log("[v0] [Trade Engine] START button clicked")
    setIsStarting(true)
    try {
      console.log("[v0] [Trade Engine] Sending POST to /api/trade-engine/start")
      const response = await fetch("/api/trade-engine/start", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await response.json()
      console.log("[v0] [Trade Engine] Start response:", { ok: response.ok, status: response.status, data })

      if (response.ok && data.success) {
        console.log("[v0] [Trade Engine] Start SUCCESS - showing toast")
        toast.success(data.message || "Global Trade Engine started successfully")
        // Refresh status immediately and again after 500ms
        await loadStatus()
        setTimeout(loadStatus, 500)
        setTimeout(loadStatus, 1500)
      } else {
        console.log("[v0] [Trade Engine] Start FAILED:", data.error)
        toast.error(data.error || "Failed to start engine")
      }
    } catch (error) {
      console.error("[v0] [Trade Engine] Start EXCEPTION:", error)
      toast.error("Failed to start engine")
    } finally {
      setIsStarting(false)
    }
  }

  const handlePause = async () => {
    setIsPausing(true)
    try {
      const response = await fetch("/api/trade-engine/pause", { method: "POST" })
      const data = await response.json()

      if (response.ok) {
        toast.success("Global Trade Engine paused")
        await loadStatus()
      } else {
        toast.error(data.error || "Failed to pause engine")
      }
    } catch (error) {
      toast.error("Failed to pause engine")
      console.error("[v0] Error pausing engine:", error)
    } finally {
      setIsPausing(false)
    }
  }

  const handleResume = async () => {
    setIsResuming(true)
    try {
      const response = await fetch("/api/trade-engine/resume", { method: "POST" })
      const data = await response.json()

      if (response.ok) {
        toast.success("Global Trade Engine resumed")
        await loadStatus()
      } else {
        toast.error(data.error || "Failed to resume engine")
      }
    } catch (error) {
      toast.error("Failed to resume engine")
      console.error("[v0] Error resuming engine:", error)
    } finally {
      setIsResuming(false)
    }
  }

  const handleStop = async () => {
    setIsStopping(true)
    try {
      const response = await fetch("/api/trade-engine/stop", { method: "POST" })
      const data = await response.json()

      if (response.ok) {
        toast.success("Global Trade Engine stopped")
        await loadStatus()
      } else {
        toast.error(data.error || "Failed to stop engine")
      }
    } catch (error) {
      toast.error("Failed to stop engine")
      console.error("[v0] Error stopping engine:", error)
    } finally {
      setIsStopping(false)
    }
  }

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const getStatusBadge = () => {
    if (!status) return <Badge variant="outline">Unknown</Badge>
    if (!status.running) return <Badge variant="secondary">Stopped</Badge>
    if (status.paused)
      return (
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">
          Paused
        </Badge>
      )
    return (
      <Badge variant="default" className="bg-green-500/10 text-green-600">
        Running
      </Badge>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4" />
              Trade Engine
            </CardTitle>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Status Overview */}
        <div className="grid grid-cols-2 md:grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Exchanges</p>
            <p className="text-lg font-bold">{status?.connectedExchanges || 0}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Positions</p>
            <p className="text-lg font-bold">{status?.activePositions || 0}</p>
          </div>
        </div>

        {/* Control Buttons - Single toggle between Start and Pause (no Stop button) */}
        <div className="flex gap-1.5 pt-2">
          {!status?.running && (
            <Button onClick={handleStart} disabled={isStarting} size="sm" className="flex-1 text-xs">
              <Play className="h-3 w-3 mr-1" />
              {isStarting ? "..." : "Start"}
            </Button>
          )}

          {status?.running && !status?.paused && (
            <Button onClick={handlePause} disabled={isPausing} variant="outline" size="sm" className="flex-1 text-xs">
              <Pause className="h-3 w-3 mr-1" />
              {isPausing ? "..." : "Pause"}
            </Button>
          )}

          {status?.running && status?.paused && (
            <Button onClick={handleResume} disabled={isResuming} size="sm" className="flex-1 text-xs">
              <Play className="h-3 w-3 mr-1" />
              {isResuming ? "..." : "Resume"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
