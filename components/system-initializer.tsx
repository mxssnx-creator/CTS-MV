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
      console.log('[v0] [SystemInitializer] Starting comprehensive system initialization...')
      
      // STEP 1: Run /api/init for general initialization
      const initResponse = await fetch('/api/init', { 
        method: 'GET',
        cache: 'no-store',
      })
      
      if (initResponse.ok) {
        const initResult = await initResponse.json()
        console.log('[v0] [SystemInitializer] API init complete:', initResult.message)
      } else {
        console.warn('[v0] [SystemInitializer] API init returned status:', initResponse.status)
      }
      
      // STEP 2: Run comprehensive startup initialization
      const startupResponse = await fetch('/api/startup/initialize', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!startupResponse.ok) {
        console.warn('[v0] [SystemInitializer] Startup returned:', startupResponse.status)
        return
      }
      
      const startupResult = await startupResponse.json()
      
      if (startupResult.success) {
        console.log('[v0] [SystemInitializer] ✓ System fully initialized')
        console.log('[v0] [SystemInitializer] Results:', startupResult.results)
        hasInitialized = true
      } else {
        console.error('[v0] [SystemInitializer] Startup failed:', startupResult.error)
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
