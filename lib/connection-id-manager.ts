import crypto from "crypto"

/**
 * Generate a unique connection ID based on exchange + API key
 * This ensures the same API key always maps to the same connection ID
 */
export function generateConnectionIdFromApiKey(exchange: string, apiKey: string): string {
  const data = `${exchange.toLowerCase()}:${apiKey}`
  const hash = crypto.createHash("sha256").update(data).digest("hex")
  // Return a shortened hash combined with exchange prefix
  return `${exchange.toLowerCase()}-${hash.substring(0, 12)}`
}

/**
 * Check if an API key is already in use
 */
export async function isApiKeyInUse(exchange: string, apiKey: string, excludeConnectionId?: string): Promise<boolean> {
  const { getAllConnections } = await import("@/lib/redis-db")
  const connections = await getAllConnections()
  
  return connections.some((conn) => {
    if (excludeConnectionId && conn.id === excludeConnectionId) {
      return false // Exclude the connection being updated
    }
    return conn.exchange?.toLowerCase() === exchange.toLowerCase() && conn.api_key === apiKey
  })
}

/**
 * Find connection by API key to preserve data across remove/re-add
 */
export async function findConnectionByApiKey(exchange: string, apiKey: string): Promise<any | null> {
  const { getAllConnections } = await import("@/lib/redis-db")
  const connections = await getAllConnections()
  
  return connections.find((conn) => 
    conn.exchange?.toLowerCase() === exchange.toLowerCase() && 
    conn.api_key === apiKey
  ) || null
}

/**
 * Get the canonical connection ID for an exchange + API key combination
 */
export function getCanonicalConnectionId(exchange: string, apiKey: string): string {
  return generateConnectionIdFromApiKey(exchange, apiKey)
}
