'use client'

import { useEffect, useRef } from 'react'

let initializationPromise: Promise<void> | null = null
let hasInitialized = false

async function initializeSystem() {
  // Prevent multiple concurrent initializations
  if (initializationPromise) {
    return initializationPromise
  }
  if (hasInitialized) {
    return Promise.resolve()
  }

  initializationPromise = (async () => {
    try {
      console.log('[v0] [SystemInitializer] Initializing system...')
      const response = await fetch('/api/init', { 
        method: 'GET',
        // Don't cache - always run fresh
        cache: 'no-store',
      })
      
      if (!response.ok) {
        console.warn('[v0] [SystemInitializer] Init returned:', response.status)
        return
      }
      
      const result = await response.json()
      
      if (result.success) {
        console.log('[v0] [SystemInitializer] System initialized:', result.message)
        hasInitialized = true
      } else {
        console.error('[v0] [SystemInitializer] Initialization failed:', result.error)
      }
    } catch (error) {
      console.error('[v0] [SystemInitializer] Error initializing system:', error)
    } finally {
      initializationPromise = null
    }
  })()

  return initializationPromise
}

export function SystemInitializer() {
  const hasTriedInit = useRef(false)

  useEffect(() => {
    if (hasTriedInit.current) return
    hasTriedInit.current = true

    // Initialize system immediately
    initializeSystem()
  }, [])

  return null
}
