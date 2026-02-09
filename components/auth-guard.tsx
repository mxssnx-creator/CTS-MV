"use client"

import type React from "react"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  console.log("[v0] AuthGuard render: user=", user?.id, "isLoading=", isLoading)

  useEffect(() => {
    if (!isLoading && !user) {
      console.log("[v0] AuthGuard: User not authenticated, redirecting to login")
      router.push("/login")
    }
  }, [user, isLoading, router])

  if (isLoading) {
    console.log("[v0] AuthGuard: Showing loading state")
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    console.log("[v0] AuthGuard: No user, returning null")
    return null
  }

  console.log("[v0] AuthGuard: Rendering children for authenticated user")
  return <>{children}</>
}
