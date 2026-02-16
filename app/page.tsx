"use client"

import { AuthGuard } from "@/components/auth-guard"
import { Dashboard } from "@/components/dashboard/dashboard"
import { PageHeader } from "@/components/page-header"
import { useState, useEffect } from "react"

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
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
            <div className="p-4 text-red-500">
              <p>Error loading dashboard: {error}</p>
            </div>
          ) : (
            <Dashboard />
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
