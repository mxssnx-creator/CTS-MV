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
    { id: "test", name: "Test BingX Connection", status: "pending" },
    { id: "start", name: "Start Trade Engine", status: "pending" },
    { id: "enable", name: "Enable BingX on Dashboard", status: "pending" },
  ])

  const updateStep = (stepId: string, status: QuickStartStep["status"], message?: string) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status, message } : s))
  }

  const handleQuickStart = async () => {
    setIsRunning(true)
    try {
      // STEP 1: Initialize System
      updateStep("init", "loading")
      const initRes = await Promise.race([
        fetch("/api/init", { method: "GET", cache: "no-store" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Init timeout")), 10000))
      ])
      if (!initRes.ok) throw new Error(`Init failed: ${initRes.statusText}`)
      updateStep("init", "success", "System initialized")

      // STEP 2: Run Database Migrations
      updateStep("migrate", "loading")
      const dbMigrateRes = await Promise.race([
        fetch("/api/install/database/migrate", { method: "POST", cache: "no-store" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Migration timeout")), 15000))
      ])
      if (dbMigrateRes.ok) {
        const migrateData = await dbMigrateRes.json()
        updateStep("migrate", "success", "Migrations complete")
      }

      // STEP 3: Test BingX (with timeout)
      updateStep("test", "loading")
      const testRes = await Promise.race([
        fetch("/api/settings/connections/test-bingx", { method: "GET", cache: "no-store" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Test timeout")), 10000))
      ])
      if (!testRes.ok) throw new Error("BingX test failed")
      const testData = await testRes.json()
      if (!testData.success) throw new Error(testData.error || "BingX test failed")
      updateStep("test", "success", `Balance: ${testData.balance} USDT`)

      // STEP 4: Start Trade Engine
      updateStep("start", "loading")
      const startRes = await Promise.race([
        fetch("/api/trade-engine/start", { method: "POST", cache: "no-store" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Engine start timeout")), 10000))
      ])
      if (!startRes.ok) throw new Error("Engine start failed")
      const startData = await startRes.json()
      if (!startData.success) throw new Error(startData.error || "Engine start failed")
      updateStep("start", "success", "Engine running")

      // STEP 5: Enable BingX on Dashboard
      updateStep("enable", "loading")
      const enableRes = await Promise.race([
        fetch("/api/trade-engine/quick-start", { 
          method: "POST", 
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "enable" })
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Enable timeout")), 10000))
      ])
      if (!enableRes.ok) throw new Error("Enable failed")
      const enableData = await enableRes.json()
      if (!enableData.success) throw new Error(enableData.error || "Enable failed")
      updateStep("enable", "success", "BingX enabled")

      // Success
      toast.success("Quick Start Complete!")
      
      // Fetch functional overview
      try {
        const overviewRes = await Promise.race([
          fetch("/api/trade-engine/functional-overview", { cache: "no-store" }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Overview timeout")), 5000))
        ])
        if (overviewRes.ok) {
          const overview = await overviewRes.json()
          setFunctionalOverview(overview)
        }
      } catch (error) {
        console.warn("[v0] [QuickStart] Could not fetch functional overview:", error)
      }
      
      // Dispatch event to refresh UI
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("engine-state-changed", { detail: { running: true } }))
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] [QuickStart] Error:", errorMsg)
      toast.error(`Quick Start Failed: ${errorMsg}`)
      
      const currentStep = steps.find(s => s.status === "loading")
      if (currentStep) {
        updateStep(currentStep.id, "error", errorMsg)
      }
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
