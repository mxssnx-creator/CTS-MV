"use client"

import { AuthGuard } from "@/components/auth-guard"
import { Dashboard } from "@/components/dashboard/dashboard"
import { PageHeader } from "@/components/page-header"

export default function HomePage() {
  return (
    <AuthGuard>
      <div className="flex flex-col h-screen">
        <PageHeader title="Overview" description="Dashboard overview and trading statistics" />
        <div className="flex-1 overflow-auto">
          <Dashboard />
        </div>
      </div>
    </AuthGuard>
  )
}
