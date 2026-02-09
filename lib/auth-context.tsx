"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { User } from "@/lib/auth"

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>({
    id: 1,
    username: "Administrator",
    email: "mxssnx@gmail.com",
    role: "admin",
  })
  const [token, setToken] = useState<string | null>("admin-token-disabled")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Authorization system disabled - user is always logged in as admin
    console.log("[v0] AuthProvider: Initializing with default admin user")
    setIsLoading(false)
  }, [])

  console.log("[v0] AuthProvider: Providing auth context - user:", user?.id, "isLoading:", isLoading)

  const login = async (email: string, password: string) => {
    setUser({
      id: 1,
      username: "Administrator",
      email: "mxssnx@gmail.com",
      role: "admin",
    })
    setToken("admin-token-disabled")
    return { success: true }
  }

  const register = async (username: string, email: string, password: string) => {
    setUser({
      id: 1,
      username: "Administrator",
      email: "mxssnx@gmail.com",
      role: "admin",
    })
    setToken("admin-token-disabled")
    return { success: true }
  }

  const logout = () => {
    // User remains logged in as admin
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
