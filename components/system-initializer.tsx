'use client'

/**
 * SystemInitializer - No-op component.
 * All system initialization now happens in instrumentation.ts -> pre-startup.ts
 * at server startup time. No client-side init calls needed.
 */
export function SystemInitializer() {
  return null
}
