import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"

export const metadata: Metadata = {
  title: "CTS v3 - Crypto Trading System",
  description: "Advanced crypto trading system with real-time analytics and automated strategies",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background font-sans">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
