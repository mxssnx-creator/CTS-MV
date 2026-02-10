"use client"

import { AuthGuard } from "@/components/auth-guard"
import { useAuth } from "@/lib/auth-context"

function DashboardContent() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground">CTS v3.2 Dashboard</h1>
          <p className="text-muted-foreground mt-2">Welcome back, {user?.username || "Administrator"}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="p-6 border border-border rounded-lg bg-card shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">System Status</h2>
            <p className="text-sm text-muted-foreground mt-2">All systems operational</p>
            <div className="mt-4 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-foreground">Running</span>
            </div>
          </div>

          <div className="p-6 border border-border rounded-lg bg-card shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Redis Migrations</h2>
            <p className="text-sm text-muted-foreground mt-2">Schema v10 initialized</p>
            <div className="mt-4">
              <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                Complete
              </span>
            </div>
          </div>

          <div className="p-6 border border-border rounded-lg bg-card shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">User</h2>
            <p className="text-sm text-muted-foreground mt-2">Logged in as: {user?.username}</p>
            <div className="mt-4">
              <span className="inline-block px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                Admin
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 border border-border rounded-lg bg-card shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Info</h2>
          <div className="space-y-2 text-sm">
            <p className="text-foreground"><span className="font-medium">Auth Status:</span> Authenticated</p>
            <p className="text-foreground"><span className="font-medium">User ID:</span> {user?.id}</p>
            <p className="text-foreground"><span className="font-medium">Role:</span> {user?.role}</p>
            <p className="text-foreground"><span className="font-medium">Email:</span> {user?.email}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  )
}
