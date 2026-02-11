/**
 * HTML Response Parser
 * Extracts meaningful information from HTML error pages returned by APIs
 */

export function parseHTMLResponse(html: string): { title: string; message: string; statusCode?: number } {
  let title = "Server Error"
  let message = "An unexpected error occurred"
  let statusCode: number | undefined

  try {
    // Extract title from <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim()
    }

    // Try to extract status code from various patterns
    const statusMatch = html.match(/(\d{3})\s+(\w+)/i)
    if (statusMatch) {
      statusCode = parseInt(statusMatch[1])
      message = `${statusMatch[1]} ${statusMatch[2]}`
    }

    // Look for common error patterns
    const errorPatterns = [
      /<h1[^>]*>([^<]+)<\/h1>/i,
      /<p[^>]*class="[^"]*error[^"]*"[^>]*>([^<]+)<\/p>/i,
      /<span[^>]*class="[^"]*message[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<div[^>]*class="[^"]*error[^"]*"[^>]*>([^<]+)<\/div>/i,
    ]

    for (const pattern of errorPatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        message = match[1].trim().substring(0, 200)
        break
      }
    }

    // Map status codes to friendly messages
    if (statusCode === 429) {
      message = "Rate limit exceeded. Please wait before retrying."
    } else if (statusCode === 503) {
      message = "Service temporarily unavailable. API maintenance or overload."
    } else if (statusCode === 502) {
      message = "Bad gateway. Server may be restarting."
    } else if (statusCode === 500) {
      message = "Internal server error. Try again in a moment."
    } else if (statusCode === 403) {
      message = "Access forbidden. Check API permissions."
    } else if (statusCode === 401) {
      message = "Unauthorized. Verify API credentials."
    }
  } catch (error) {
    console.error("[v0] Error parsing HTML response:", error)
  }

  return { title, message, statusCode }
}

export function isHTMLResponse(contentType: string, text: string): boolean {
  return contentType.includes("text/html") || text.includes("<!DOCTYPE") || text.includes("<html")
}

export function createErrorFromHTML(
  html: string,
  defaultMessage: string = "An error occurred"
): Error {
  const parsed = parseHTMLResponse(html)
  const message = parsed.statusCode
    ? `${parsed.statusCode}: ${parsed.message}`
    : parsed.message || defaultMessage
  return new Error(message)
}
