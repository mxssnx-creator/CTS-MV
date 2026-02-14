'use client'

import { useEffect, useRef } from 'react'

export function SystemInitializer() {
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const initializeSystem = async () => {
      try {
        console.log('[v0] [SystemInitializer] Initializing system...')
        const response = await fetch('/api/init', { method: 'GET' })
        const result = await response.json()
        
        if (result.success) {
          console.log('[v0] [SystemInitializer] System initialized:', result.message)
        } else {
          console.error('[v0] [SystemInitializer] Initialization failed:', result.error)
        }
      } catch (error) {
        console.error('[v0] [SystemInitializer] Error initializing system:', error)
      }
    }

    initializeSystem()
  }, [])

  return null
}
