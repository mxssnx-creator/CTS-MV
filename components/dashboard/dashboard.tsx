"use client"

import { useAuth } from "@/lib/auth-context"

export function Dashboard() {
  const { user } = useAuth()

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CTS v3.2 Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.username || "Administrator"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="p-4 border rounded-lg bg-card">
          <h2 className="text-lg font-semibold">System Status</h2>
          <p className="text-sm text-muted-foreground mt-2">All systems operational</p>
        </div>
        
        <div className="p-4 border rounded-lg bg-card">
          <h2 className="text-lg font-semibold">Redis Migrations</h2>
          <p className="text-sm text-muted-foreground mt-2">Schema v10 initialized</p>
        </div>

        <div className="p-4 border rounded-lg bg-card">
          <h2 className="text-lg font-semibold">User</h2>
          <p className="text-sm text-muted-foreground mt-2">Logged in as: {user?.username}</p>
        </div>
      </div>
    </div>
  )
}
