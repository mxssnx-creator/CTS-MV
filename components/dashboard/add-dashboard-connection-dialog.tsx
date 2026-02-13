"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"
import { toast } from "sonner"
import type { ExchangeConnection } from "@/lib/types"

interface AddDashboardConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  enabledConnections: ExchangeConnection[] // enabled connections from settings
  onConnectionSelected: (connection: ExchangeConnection) => void
  isLoading?: boolean
}

/**
 * Dashboard-specific Add Connection Dialog
 * Shows only enabled connections from Settings
 * New connections are disabled by default in dashboard
 */
export function AddDashboardConnectionDialog({
  open,
  onOpenChange,
  enabledConnections,
  onConnectionSelected,
  isLoading = false,
}: AddDashboardConnectionDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSelect = (connection: ExchangeConnection) => {
    setSelectedId(connection.id)
  }

  const handleAdd = async () => {
    if (!selectedId) {
      toast.error("Please select a connection")
      return
    }

    const selected = enabledConnections.find(c => c.id === selectedId)
    if (!selected) return

    setIsSubmitting(true)
    try {
      // Add connection to dashboard (disabled by default)
      onConnectionSelected(selected)
      toast.success(`Added ${selected.name}`, {
        description: "Connection added (disabled by default - enable to activate)"
      })
      setSelectedId(null)
      onOpenChange(false)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to add connection"
      toast.error("Failed to add connection", { description: errorMsg })
      console.error("[v0] [AddDashboardConnectionDialog] Error:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Connection to Dashboard</DialogTitle>
          <DialogDescription>
            Select an enabled exchange connection from your settings to add to the dashboard.
            New connections are disabled by default.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[300px] w-full pr-4">
          {enabledConnections.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>No enabled connections available in settings</p>
            </div>
          ) : (
            <div className="space-y-2 pr-4">
              {enabledConnections.map((connection) => (
                <Card
                  key={connection.id}
                  className={`cursor-pointer transition-all ${
                    selectedId === connection.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => handleSelect(connection)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm">{connection.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {connection.exchange} • {connection.api_type || "spot"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {connection.is_testnet ? "Testnet" : "Live"}
                        </Badge>
                        {selectedId === connection.id && (
                          <Check className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!selectedId || isSubmitting || isLoading}
          >
            {isSubmitting ? "Adding..." : "Add Connection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
