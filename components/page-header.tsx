"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

interface PageHeaderProps {
  title?: string
  description?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex h-16 items-center gap-4 px-4">
        <SidebarTrigger className="h-8 w-8" />
        <Separator orientation="vertical" className="h-8" />
        {title && (
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        )}
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </div>
  )
}
