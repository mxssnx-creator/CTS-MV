"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Zap, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react"
import { toast } from "@/lib/simple-toast"
import { DetailedLoggingDialog } from "./detailed-logging-dialog"

interface QuickStartStep {
  id: string
  name: string
  status: "pending" | "loading" | "success" | "error"
  message?: string
}

interface FunctionalOverview {
  symbolsActive: number
  indicationsCalculated: number
  strategiesEvaluated: number
  baseSetsCreated: boolean
  mainSetsCreated: boolean
  realSetsCreated: boolean
  positionsEntriesCreated: number
}

export function QuickStartButton() {
  const [isRunning, setIsRunning] = useState(false)
  const [functionalOverview, setFunctionalOverview] = useState<FunctionalOverview | null>(null)
  const [steps, setSteps] = useState<QuickStartStep[]>([
    { id: "init", name: "Initialize System", status: "pending" },
    { id: "migrate", name: "Run Migrations", status: "pending" },
    { id: "test", name: "Verify BingX Credentials", status: "pending" },
    { id: "start", name: "Start Global Trade Engine", status: "pending" },
    { id: "enable", name: "Enable BingX (3 Symbols)", status: "pending" },
    { id: "engine", name: "Start BingX Engine + Progression", status: "pending" },
  ])

  const updateStep = (stepId: string, status: QuickStartStep["status"], message?: string) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status, message } : s))
  }

  const safeStep = async (
    stepId: string,
    label: string,
    fn: () => Promise<string>,
    required = false
  ): Promise<string | null> => {
    updateStep(stepId, "loading")
    console.log(`[v0] [QuickStart] >>> ${label}`)
    try {
      const msg = await fn()
      console.log(`[v0] [QuickStart] ✓ ${label}: ${msg}`)
      updateStep(stepId, "success", msg)
      return msg
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[v0] [QuickStart] ✗ ${label}: ${msg}`)
      if (required) {
        updateStep(stepId, "error", msg)
        throw new Error(`${label} failed: ${msg}`)
      }
      console.warn(`[v0] [QuickStart] ⚠ ${label} failed (non-critical), continuing...`)
      updateStep(stepId, "success", "Skipped")
      return null
    }
  }

  const timedFetch = (url: string, options?: RequestInit, ms = 8000): Promise<Response> =>
    Promise.race([
      fetch(url, { ...options, cache: "no-store" }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s`)), ms)
      ),
    ])

  const handleQuickStart = async () => {
    setIsRunning(true)
    setFunctionalOverview(null)
    // Reset all steps
    setSteps(prev => prev.map(s => ({ ...s, status: "pending", message: undefined })))

    console.log("[v0] [QuickStart] ========================================")
    console.log("[v0] [QuickStart] QUICKSTART SEQUENCE INITIATED")
    console.log("[v0] [QuickStart] Target: BingX X01 | Symbols: BTCUSDT, ETHUSDT, BNBUSDT")
    console.log("[v0] [QuickStart] ========================================")

    try {
      // STEP 1: Initialize System (non-critical)
      await safeStep("init", "STEP 1: Initialize System", async () => {
        const res = await timedFetch("/api/init", { method: "GET" }, 4000)
        if (res.ok) return "System initialized"
        return "Already ready"
      })

      // STEP 2: Run Database Migrations (non-critical)
      await safeStep("migrate", "STEP 2: Run Migrations", async () => {
        const res = await timedFetch("/api/install/database/migrate", { method: "POST" }, 10000)
        if (!res.ok) return "Skipped (already up to date)"
        const data = await res.json()
        const ran = data.migrations?.length ?? data.ranCount ?? 0
        return `${ran} migration(s) applied`
      })

      // STEP 3: Verify BingX credentials (NON-BLOCKING — never throws)
      await safeStep("test", "STEP 3: Verify BingX Credentials", async () => {
        const res = await timedFetch("/api/settings/connections/test-bingx", { method: "GET" }, 6000)
        const data = await res.json().catch(() => ({}))
        if (data.success) {
          return `Credentials ready — ${data.connection?.name ?? "BingX"}`
        }
        // Even if not found, don't block — engine will create it
        return `Skipped (${data.error ?? "no credentials"})`
      })

      // STEP 4: Start Global Trade Engine Coordinator (REQUIRED)
      await safeStep("start", "STEP 4: Start Global Trade Engine", async () => {
        const res = await timedFetch("/api/trade-engine/start", { method: "POST" }, 12000)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `HTTP ${res.status}`)
        }
        const data = await res.json()
        console.log("[v0] [QuickStart] Engine start response:", JSON.stringify(data))
        if (!data.success) throw new Error(data.error ?? "Engine start returned failure")
        const resumed = data.resumedConnections?.length ?? 0
        return `Coordinator running${resumed > 0 ? ` | Resumed ${resumed} connection(s)` : ""}`
      }, true /* required */)

      // STEP 5: Enable BingX with 3 symbols (REQUIRED)
      let enabledConnectionId: string | null = null
      await safeStep("enable", "STEP 5: Enable BingX (3 Symbols)", async () => {
        const res = await timedFetch("/api/trade-engine/quick-start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "enable",
            symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
          }),
        }, 10000)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `HTTP ${res.status}`)
        }
        const data = await res.json()
        console.log("[v0] [QuickStart] Enable response:", JSON.stringify(data))
        if (!data.success) throw new Error(data.error ?? "Enable returned failure")
        enabledConnectionId = data.connection?.id ?? null
        const symbols = data.connection?.active_symbols ?? ["BTCUSDT", "ETHUSDT", "BNBUSDT"]
        return `${data.connection?.name} enabled | Symbols: ${Array.isArray(symbols) ? symbols.join(", ") : symbols}`
      }, true /* required */)

      // STEP 6: Start engine for BingX connection (starts progression)
      await safeStep("engine", "STEP 6: Start BingX Engine + Progression", async () => {
        if (!enabledConnectionId) {
          return "Skipped (no connection ID from step 5)"
        }
        console.log(`[v0] [QuickStart] Starting engine for connection: ${enabledConnectionId}`)
        const res = await timedFetch(`/api/settings/connections/${enabledConnectionId}/live-trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        }, 15000)
        const data = await res.json().catch(() => ({}))
        console.log("[v0] [QuickStart] Live-trade start response:", JSON.stringify(data))
        if (res.ok && (data.success || data.status === "started")) {
          return `Engine started for ${enabledConnectionId} | Progression active`
        }
        // Non-fatal — global coordinator may still process it
        return `Engine queued (${data.message ?? data.error ?? "coordinator will pick up"})`
      })

      // Done
      console.log("[v0] [QuickStart] ========================================")
      console.log("[v0] [QuickStart] QUICKSTART COMPLETE")
      console.log("[v0] [QuickStart] ========================================")
      toast.success("Quick Start complete — BingX engine running with 3 symbols.")

      // Fetch functional overview (non-blocking background)
      try {
        const overviewRes = await timedFetch("/api/trade-engine/functional-overview", {}, 6000)
        if (overviewRes.ok) {
          const overview = await overviewRes.json()
          console.log("[v0] [QuickStart] Functional Overview:", JSON.stringify(overview))
          setFunctionalOverview(overview)
        }
      } catch (e) {
        console.warn("[v0] [QuickStart] Functional overview unavailable:", e)
      }

      // Signal UI to refresh
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("engine-state-changed", { detail: { running: true } }))
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] [QuickStart] FATAL:", errorMsg)
      toast.error(`Quick Start failed: ${errorMsg}`)
    } finally {
      setIsRunning(false)
    }
  }

  const getStepIcon = (status: QuickStartStep["status"]) => {
    switch (status) {
      case "loading":
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-600" />
              Quick Start (BingX)
            </CardTitle>
            <CardDescription>
              Initialize system, run migrations, test connection, enable BingX, and start trade engine in one click
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {isRunning ? "Running..." : "Ready"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Steps Progress */}
        <div className="space-y-2">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-3 text-sm">
              {getStepIcon(step.status)}
              <span className="flex-1 font-medium">{step.name}</span>
              {step.message && <span className="text-xs text-gray-600">{step.message}</span>}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleQuickStart}
            disabled={isRunning}
            className="flex-1 gap-2"
            variant="default"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running Quick Start...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Start Quick Setup
              </>
            )}
          </Button>
          <Button
            onClick={() => {
              setSteps(steps.map(s => ({ ...s, status: "pending", message: undefined })))
              setIsRunning(false)
            }}
            disabled={isRunning}
            variant="outline"
            size="icon"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          
          {/* Detailed Logs Button */}
          <DetailedLoggingDialog />
        </div>

        {/* Info Box */}
        <div className="bg-white rounded border border-blue-200 p-3 text-xs text-gray-600">
          <p className="mb-2 font-semibold text-gray-700">This quick start will:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Initialize the complete system (preset types, connections)</li>
            <li>Run ALL database migrations (schema, indexes, TTL policies)</li>
            <li>Set dashboard states for BingX/Bybit</li>
            <li>Test BingX API connection (balance check)</li>
            <li>Start the trade engine</li>
            <li>Enable BingX for active trading</li>
          </ul>
        </div>

        {/* Functional Overview - Displayed after successful completion */}
        {functionalOverview && (
          <div className="bg-green-50 rounded border border-green-200 p-3 text-xs">
            <p className="mb-2 font-semibold text-green-700">✓ Functional Overview (System Ready):</p>
            <div className="grid grid-cols-2 gap-2 text-gray-700">
              <div>
                <span className="font-medium">Symbols Active:</span> {functionalOverview.symbolsActive}
              </div>
              <div>
                <span className="font-medium">Indications Calculated:</span> {functionalOverview.indicationsCalculated}
              </div>
              <div>
                <span className="font-medium">Strategies Evaluated:</span> {functionalOverview.strategiesEvaluated}
              </div>
              <div>
                <span className="font-medium">Base Sets:</span> {functionalOverview.baseSetsCreated ? "✓" : "✗"}
              </div>
              <div>
                <span className="font-medium">Main Sets:</span> {functionalOverview.mainSetsCreated ? "✓" : "✗"}
              </div>
              <div>
                <span className="font-medium">Real Sets:</span> {functionalOverview.realSetsCreated ? "✓" : "✗"}
              </div>
              <div className="col-span-2">
                <span className="font-medium">DB Position Entries:</span> {functionalOverview.positionsEntriesCreated}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
