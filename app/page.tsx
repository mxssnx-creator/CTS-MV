"use client"

import { AuthGuard } from "@/components/auth-guard"
import { Dashboard } from "@/components/dashboard/dashboard"
import { PageHeader } from "@/components/page-header"
import { useState, useEffect, Suspense } from "react"

function DashboardWithErrorBoundary() {
  return (
    <Suspense fallback={<div className="p-4">Loading dashboard...</div>}>
      <Dashboard />
    </Suspense>
  )
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Call startup-complete endpoint
    fetch("/api/health/startup-complete", { method: "POST" })
      .catch(err => console.error("[v0] Failed to notify startup complete:", err))
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
          <DashboardWithErrorBoundary />
        </div>
      </div>
    </AuthGuard>
  )
}
