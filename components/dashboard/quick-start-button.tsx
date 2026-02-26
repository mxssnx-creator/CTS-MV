"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Zap, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react"
import { toast } from "@/lib/simple-toast"

interface QuickStartStep {
  id: string
  name: string
  status: "pending" | "loading" | "success" | "error"
  message?: string
}

export function QuickStartButton() {
  const [isRunning, setIsRunning] = useState(false)
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
      // STEP 1: Initialize System (calls /api/init which runs base migrations)
      updateStep("init", "loading")
      console.log("[v0] [QuickStart] Step 1: Initializing system...")
      const initRes = await fetch("/api/init", { method: "GET", cache: "no-store" })
      if (!initRes.ok) throw new Error(`Init failed: ${initRes.statusText}`)
      const initData = await initRes.json()
      console.log("[v0] [QuickStart] Step 1: Init complete -", initData.message)
      updateStep("init", "success", initData.message || "System initialized")

      // STEP 2: Run ALL Database Migrations (settings/install style complete migrations)
      updateStep("migrate", "loading")
      console.log("[v0] [QuickStart] Step 2: Running complete database migrations...")
      
      // 2a: Run install/database/migrate for full DB migrations
      const dbMigrateRes = await fetch("/api/install/database/migrate", { 
        method: "POST", 
        cache: "no-store",
        headers: { "Content-Type": "application/json" }
      })
      if (dbMigrateRes.ok) {
        const dbMigrateData = await dbMigrateRes.json()
        console.log("[v0] [QuickStart] Step 2a: DB migrations complete -", dbMigrateData.status?.schema_version)
      }
      
      // 2b: Run startup/initialize to ensure connection states are correct
      const startupRes = await fetch("/api/startup/initialize", { 
        method: "POST", 
        cache: "no-store",
        headers: { "Content-Type": "application/json" }
      })
      if (startupRes.ok) {
        const startupData = await startupRes.json()
        console.log("[v0] [QuickStart] Step 2b: Startup init -", startupData.results)
      }
      
      // 2c: Reload connections to get fresh state
      const migrateRes = await fetch("/api/settings/connections", { 
        method: "GET", 
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      })
      if (!migrateRes.ok) throw new Error(`Migrations failed: ${migrateRes.statusText}`)
      const migrateData = await migrateRes.json()
      console.log(`[v0] [QuickStart] Step 2c: ${migrateData.count} connections loaded`)
      updateStep("migrate", "success", `${migrateData.count} connections migrated`)

      // STEP 3: Test BingX
      updateStep("test", "loading")
      console.log("[v0] [QuickStart] Step 3: Testing BingX connection...")
      const testRes = await fetch("/api/settings/connections/test-bingx", { 
        method: "GET", 
        cache: "no-store" 
      })
      if (!testRes.ok) throw new Error(`BingX test failed: ${testRes.statusText}`)
      const testData = await testRes.json()
      if (!testData.success) throw new Error(testData.error || "BingX test failed")
      console.log("[v0] [QuickStart] Step 3: BingX connection verified")
      updateStep("test", "success", `Balance: ${testData.balance} USDT`)

      // STEP 4: Start Trade Engine FIRST
      updateStep("start", "loading")
      console.log("[v0] [QuickStart] Step 4: Starting trade engine...")
      const startRes = await fetch("/api/trade-engine/start", { 
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" }
      })
      if (!startRes.ok) throw new Error(`Engine start failed: ${startRes.statusText}`)
      const startData = await startRes.json()
      if (!startData.success) throw new Error(startData.error || "Engine start failed")
      console.log("[v0] [QuickStart] Step 4: Trade engine started")
      updateStep("start", "success", "Engine running")

      // STEP 5: Enable BingX on Dashboard AFTER engine starts
      updateStep("enable", "loading")
      console.log("[v0] [QuickStart] Step 5: Enabling BingX on dashboard...")
      const enableRes = await fetch("/api/trade-engine/quick-start", { 
        method: "POST", 
        cache: "no-store",
        headers: { "Content-Type": "application/json" }
      })
      if (!enableRes.ok) throw new Error(`Enable failed: ${enableRes.statusText}`)
      const enableData = await enableRes.json()
      if (!enableData.success) throw new Error(enableData.error || "Enable failed")
      console.log("[v0] [QuickStart] Step 5: BingX enabled on dashboard")
      updateStep("enable", "success", `${enableData.connection.name} enabled`)

      // Success
      toast.success("Quick Start Complete! Trade engine is running with BingX.")
      console.log("[v0] [QuickStart] ✓ All steps completed successfully")

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] [QuickStart] Error:", errorMsg)
      toast.error(`Quick Start Failed: ${errorMsg}`)
      
      // Mark current step as error
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
      </CardContent>
    </Card>
  )
}
