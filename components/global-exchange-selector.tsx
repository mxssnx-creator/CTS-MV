"use client"

import { useExchange } from "@/lib/exchange-context"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

export function GlobalExchangeSelector() {
  const { selectedExchange, setSelectedExchange, activeConnections } = useExchange()

  if (activeConnections.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          No Exchanges
        </Badge>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Exchange:</span>
      <Select value={selectedExchange || ""} onValueChange={(value) => setSelectedExchange(value || null)}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Select exchange" />
        </SelectTrigger>
        <SelectContent>
          {activeConnections.map((conn) => (
            <SelectItem key={conn.id} value={conn.exchange}>
              <div className="flex items-center gap-2">
                <span>{conn.name}</span>
                {conn.is_testnet && (
                  <Badge variant="outline" className="text-xs">
                    Testnet
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
