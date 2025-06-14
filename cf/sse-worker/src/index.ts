import { createLogger } from './utils/logger'
import { createMetrics } from './utils/metrics'
import { createRateLimiter } from './utils/rateLimiter'
import { SSEChannelDO } from './SSEChannelDO'

export interface Env {
  API_TOKEN: string // Secret token for authenticating broadcast requests
  SSE_CHANNEL: DurableObjectNamespace
}

const getCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
}

const optionsCorsHeaders = {
  ...getCorsHeaders,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

// Create global utilities
const logger = createLogger('sse-worker')
const metrics = createMetrics()

// Create a global rate limiter for broadcast requests
// Allow 60 broadcasts per minute (1 per second on average)
const broadcastRateLimiter = createRateLimiter(10, 60)

// Create a global rate limiter for connection requests
// Allow 120 connections per minute (2 per second on average) per IP
const connectionRateLimiter = createRateLimiter(20, 120)

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Start request timer and generate request ID for tracing
    const requestId = crypto.randomUUID()
    metrics.startTimer(`request_${requestId}`)

    // Log request
    logger.info('Request received', {
      requestId,
      method: request.method,
      url: request.url,
      cf: request.cf,
    })

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      metrics.increment('cors_preflight')
      logger.debug('CORS preflight request', { requestId })
      return new Response(null, {
        status: 204,
        headers: optionsCorsHeaders,
      })
    }

    const { searchParams } = new URL(request.url)
    const channel = searchParams.get('channel')

    if (!channel || !/^[a-zA-Z0-9-_]+$/.test(channel)) {
      metrics.increment('error_invalid_channel')
      logger.warn('Invalid channel name', { requestId, channel })
      return new Response('Invalid channel name', { status: 400 })
    }

    // Get client IP for rate limiting
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'

    // Get Durable Object for this channel
    const id = env.SSE_CHANNEL.idFromName(channel)
    const channelObject = env.SSE_CHANNEL.get(id)

    // Route the request to the appropriate path in the Durable Object
    const doUrl = new URL(request.url)

    if (request.method === 'GET') {
      // Apply rate limiting for connections
      const connectionKey = `${clientIp}:${channel}:connect`
      if (!connectionRateLimiter.allowRequest(connectionKey)) {
        metrics.increment('rate_limited_connection')
        logger.warn('Connection rate limit exceeded', {
          requestId,
          clientIp,
          channel,
        })
        return new Response('Too many connection attempts. Please try again later.', {
          status: 429,
          headers: {
            ...getCorsHeaders,
            'Retry-After': '60',
          },
        })
      }

      // Check for lastEventId query parameter for reconnection
      const lastEventId = searchParams.get('lastEventId')

      metrics.increment('connection_attempt')
      logger.info('Client connecting', {
        requestId,
        clientIp,
        channel,
        lastEventId: lastEventId ?? undefined,
      })

      // Client connecting for SSE
      doUrl.pathname = '/connect'

      // Add lastEventId to the URL if present
      if (lastEventId) {
        doUrl.searchParams.set('lastEventId', lastEventId)
      }
    } else if (request.method === 'POST') {
      // Verify authorization for broadcast requests
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        metrics.increment('error_unauthorized')
        logger.warn('Missing or invalid authorization header', { requestId })
        return new Response('Unauthorized', { status: 401 })
      }

      const token = authHeader.substring(7)
      if (token !== env.API_TOKEN) {
        metrics.increment('error_forbidden')
        logger.warn('Invalid API token', { requestId })
        return new Response('Invalid token', { status: 403 })
      }

      // Apply rate limiting for broadcasts
      const broadcastKey = `${channel}:broadcast`
      if (!broadcastRateLimiter.allowRequest(broadcastKey)) {
        metrics.increment('rate_limited_broadcast')
        logger.warn('Broadcast rate limit exceeded', { requestId, channel })
        return new Response('Rate limit exceeded for broadcasts. Please try again later.', {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders,
            'Retry-After': '60',
          },
        })
      }

      metrics.increment('broadcast_attempt')
      logger.info('Broadcast message received', { requestId, channel })

      // Backend sending a broadcast message
      doUrl.pathname = '/broadcast'
    }

    try {
      // Forward the request to the Durable Object
      // Add request ID to headers for tracing
      const headers = new Headers(request.headers)
      headers.set('X-Request-ID', requestId)

      // For GET requests (SSE connections), use waitUntil to ensure the request is processed
      // even if the client disconnects
      const modifiedRequest = new Request(request, { headers })

      if (request.method === 'GET') {
        logger.debug('Forwarding SSE connection to Durable Object', {
          requestId,
          channel,
          url: doUrl.toString(),
        })

        // Use waitUntil to ensure the connection is established
        const doResponsePromise = channelObject.fetch(doUrl.toString(), modifiedRequest)
        ctx.waitUntil(
          doResponsePromise.catch((err) => {
            logger.error('Error in waitUntil for SSE connection', err, {
              requestId,
              channel,
            })
          })
        )

        // Return the response directly
        const response = await doResponsePromise

        // Log response
        const duration = metrics.endTimer(`request_${requestId}`)
        logger.info('SSE connection established', {
          requestId,
          status: response.status,
          duration,
          metrics: metrics.getMetrics(),
        })

        return response
      } else {
        // For POST requests (broadcasts), handle normally
        const response = await channelObject.fetch(doUrl.toString(), modifiedRequest)

        // Log response
        const duration = metrics.endTimer(`request_${requestId}`)
        logger.info('Request completed', {
          requestId,
          status: response.status,
          duration,
          metrics: metrics.getMetrics(),
        })

        return response
      }
    } catch (error) {
      metrics.increment('error_internal')
      const duration = metrics.endTimer(`request_${requestId}`)
      logger.error('Request failed', error as Error, {
        requestId,
        duration,
        metrics: metrics.getMetrics(),
      })

      return new Response('Internal Server Error', {
        status: 500,
        headers: getCorsHeaders,
      })
    }
  },
}

// Export the Durable Object class and utilities
export { SSEChannelDO }
