"use client"

import { AuthGuard } from "@/components/auth-guard"
import { Dashboard } from "@/components/dashboard/dashboard"
import { PageHeader } from "@/components/page-header"
import { useState, useEffect } from "react"

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      setMounted(true)
      console.log("[v0] HomePage mounted successfully")
      
      // Fix: Ensure all BingX/Bybit connections use mainnet (not testnet) - both Redis and DB
      Promise.all([
        fetch("/api/trade-engine/fix-testnet", { method: "POST" }),
        fetch("/api/trade-engine/fix-testnet-database", { method: "POST" }),
      ])
        .then(() => console.log("[v0] Testnet fixes complete"))
        .catch(err => console.warn("[v0] Testnet fix failed:", err instanceof Error ? err.message : String(err)))
      
      // Auto-setup: Add BingX to active connections if it has credentials
      fetch("/api/trade-engine/auto-setup", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then(() => console.log("[v0] Auto-setup complete"))
        .catch(err => console.warn("[v0] Auto-setup failed:", err instanceof Error ? err.message : String(err)))
      
      // Call startup-complete endpoint to trigger connection testing
      fetch("/api/health/startup-complete", { method: "POST" })
        .then(() => console.log("[v0] Startup complete notification sent"))
        .catch(err => console.warn("[v0] Failed to notify startup complete:", err instanceof Error ? err.message : String(err)))
    } catch (err) {
      console.error("[v0] Error in HomePage useEffect:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
    }
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Initializing...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthGuard>
      <div className="flex flex-col h-screen">
        <PageHeader title="Overview" description="Dashboard overview and trading statistics" />
        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700 font-medium">Error loading dashboard</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          ) : (
            <ErrorBoundaryWrapper>
              <Dashboard />
            </ErrorBoundaryWrapper>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}

function ErrorBoundaryWrapper({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false)
  const [error, setErrorMessage] = useState<string>("")

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[v0] Global error caught:", event.error)
      setHasError(true)
      setErrorMessage(event.error?.message || "Unknown error")
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[v0] Unhandled rejection caught:", event.reason)
      setHasError(true)
      setErrorMessage(event.reason?.message || String(event.reason) || "Unknown error")
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [])

  if (hasError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700 font-medium">Dashboard Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
          <button
            onClick={() => {
              setHasError(false)
              setErrorMessage("")
              window.location.reload()
            }}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
