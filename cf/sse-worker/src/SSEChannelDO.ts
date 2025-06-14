import { createLogger } from './utils/logger'
import { createMetrics } from './utils/metrics'

// Store recent messages for reconnection support
interface StoredMessage {
  id: string
  data: string
  timestamp: number
}

// Enhanced client connection tracking
interface ClientConnection {
  writer: WritableStreamDefaultWriter<Uint8Array>
  connectedAt: number
  lastActivity: number
  clientIp?: string
  userAgent?: string
  requestId?: string
}

export class SSEChannelDO implements DurableObject {
  private sessions: Map<string, ClientConnection> = new Map()
  private encoder = new TextEncoder()
  private logger = createLogger('SSEChannelDO')
  private metrics = createMetrics()
  private channelName: string = 'unknown'
  private storage: DurableObjectStorage

  // Store recent messages for reconnection support (last 100 messages, up to 5 minutes old)
  private recentMessages: StoredMessage[] = []
  private readonly MAX_STORED_MESSAGES = 100
  private readonly MESSAGE_TTL_MS = 5 * 60 * 1000 // 5 minutes
  private readonly PING_INTERVAL_MS = 30000 // 30 seconds
  private lastCleanup = Date.now()

  constructor(state: DurableObjectState, env: any) {
    this.storage = state.storage
  }

  // This method is automatically called when the alarm fires
  async alarm() {
    await this.handleAlarm()
  }

  // Handle HTTP requests
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Extract request ID for tracing
    const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID()

    // Extract channel name from DO ID
    if (this.channelName === 'unknown') {
      // The channel name is encoded in the Durable Object ID
      // We can extract it from the request URL
      const urlParts = url.pathname.split('/')
      this.channelName = urlParts[urlParts.length - 1] || 'unknown'
    }

    this.logger.info('DO request received', {
      requestId,
      path,
      method: request.method,
      channel: this.channelName,
    })

    // Track metrics
    this.metrics.increment(`do_request_${request.method.toLowerCase()}`)

    // Periodically clean up old messages (every minute)
    const now = Date.now()
    if (now - this.lastCleanup > 60000) {
      this.cleanupOldMessages()
      this.lastCleanup = now
    }

    // Handle new client connections
    if (path === '/connect' && request.method === 'GET') {
      return this.handleConnect(request, requestId)
    }

    // Handle message broadcasts from backend
    if (path === '/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request, requestId)
    }

    this.metrics.increment('error_not_found')
    this.logger.warn('Path not found', { requestId, path })
    return new Response('Not found', { status: 404 })
  }

  // Clean up old messages
  private cleanupOldMessages(): void {
    const now = Date.now()
    const initialCount = this.recentMessages.length
    this.recentMessages = this.recentMessages.filter((msg) => now - msg.timestamp < this.MESSAGE_TTL_MS)
    const removedCount = initialCount - this.recentMessages.length

    if (removedCount > 0) {
      this.logger.debug('Cleaned up old messages', {
        channel: this.channelName,
        removedCount,
        remainingCount: this.recentMessages.length,
      })
      this.metrics.increment('messages_cleaned_up', removedCount)
    }
  }

  // Handle new SSE client connections
  async handleConnect(request: Request, requestId: string): Promise<Response> {
    this.metrics.startTimer(`connect_${requestId}`)

    if (this.sessions.size >= 1000) {
      this.metrics.increment('error_too_many_connections')
      this.logger.warn('Too many connections', {
        requestId,
        channel: this.channelName,
        connectionCount: this.sessions.size,
      })
      return new Response('Too many connections', { status: 429 })
    }

    const sessionId = crypto.randomUUID()
    const now = Date.now()
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'
    const userAgent = request.headers.get('User-Agent') || 'unknown'

    // Create a new TransformStream for this client
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Store the client's connection info with timestamp and metadata
    this.sessions.set(sessionId, {
      writer,
      connectedAt: now,
      lastActivity: now,
      clientIp,
      userAgent,
      requestId,
    })

    // Set up cleanup when client disconnects
    request.signal.addEventListener('abort', () => {
      this.closeClientSession(sessionId, 'client disconnected')
    })

    // Check for lastEventId query parameter for reconnection
    const url = new URL(request.url)
    const lastEventId = url.searchParams.get('lastEventId')
    const isReconnect = !!lastEventId

    this.logger.debug('Preparing to send initial messages', {
      sessionId,
      requestId,
      channel: this.channelName,
    })

    // Send initial connection message as a proper event
    const connectMsg = this.encoder.encode(
      `event: connect\nid: connect-${Date.now()}\ndata: {"connected": true, "clients": ${this.sessions.size}, "channel": "${this.channelName}"}\n\n`
    )
    await writer.ready
    await writer.write(connectMsg)

    // Send a test event immediately to verify connection
    const testMsg = this.encoder.encode(
      `event: test\nid: test-${Date.now()}\ndata: {"test": true, "time": ${Date.now()}, "channel": "${this.channelName}"}\n\n`
    )
    await writer.ready
    await writer.write(testMsg)

    // Send a comment to force flush
    await writer.ready
    await writer.write(this.encoder.encode(`:initial-connection-complete ${Date.now()}\n\n`))

    this.logger.debug('Initial messages sent', {
      sessionId,
      requestId,
      channel: this.channelName,
    })

    // If client is reconnecting, send missed messages
    if (isReconnect) {
      this.metrics.increment('client_reconnect')
      this.logger.info('Client reconnecting', {
        requestId,
        sessionId,
        lastEventId,
        channel: this.channelName,
      })

      const missedMessages = this.getMessagesSince(lastEventId)
      this.logger.debug('Sending missed messages', {
        requestId,
        sessionId,
        count: missedMessages.length,
      })

      for (const msg of missedMessages) {
        await writer.ready
        await writer.write(this.encoder.encode(`id: ${msg.id}\ndata: ${msg.data}\n\n`))
      }

      // Force flush after sending missed messages
      await writer.ready
      await writer.write(this.encoder.encode(`:missed-messages-flush\n\n`))

      this.metrics.increment('missed_messages_sent', missedMessages.length)
    }

    // Schedule an alarm for pings if this is the first client
    if (this.sessions.size === 1) {
      this.storage.setAlarm(Date.now() + this.PING_INTERVAL_MS)
      this.logger.debug('Scheduled first ping alarm', {
        channel: this.channelName,
        nextPingAt: new Date(Date.now() + this.PING_INTERVAL_MS).toISOString(),
      })
    }

    const connectDuration = this.metrics.endTimer(`connect_${requestId}`)
    this.metrics.increment('client_connected')
    this.logger.info('Client connected', {
      requestId,
      sessionId,
      clientIp,
      userAgent: userAgent.substring(0, 100), // Truncate long user agents
      isReconnect,
      connectDuration,
      channel: this.channelName,
      clientCount: this.sessions.size,
    })

    // Create response with proper SSE headers
    const response = new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable proxy buffering
        'Access-Control-Allow-Origin': '*',
      },
    })

    this.logger.debug('SSE response created', {
      sessionId,
      requestId,
      channel: this.channelName,
    })

    return response
  }

  // Get messages since a specific event ID
  private getMessagesSince(lastEventId: string): StoredMessage[] {
    const lastEventIndex = this.recentMessages.findIndex((msg) => msg.id === lastEventId)

    if (lastEventIndex === -1) {
      // If we can't find the last event ID, return all recent messages
      // This could happen if the message is too old and was cleaned up
      this.metrics.increment('last_event_id_not_found')
      return [...this.recentMessages]
    }

    // Return all messages after the last event ID
    return this.recentMessages.slice(lastEventIndex + 1)
  }

  // Handle broadcast messages from backend
  async handleBroadcast(request: Request, requestId: string): Promise<Response> {
    this.metrics.startTimer(`broadcast_${requestId}`)

    if (!request.body) {
      this.metrics.increment('error_missing_body')
      this.logger.warn('Missing request body', { requestId })
      return new Response('Missing body', { status: 400 })
    }

    // Check content size limit (1MB)
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10)
    if (contentLength > 1024 * 1024) {
      this.metrics.increment('error_message_too_large')
      this.logger.warn('Message too large', { requestId, contentLength })
      return new Response('Message too large (max 1MB)', { status: 413 })
    }

    let data: any
    try {
      // Parse the message data
      data = await request.json()

      // Basic validation - ensure data is an object
      if (typeof data !== 'object' || data === null) {
        this.metrics.increment('error_invalid_format')
        this.logger.warn('Invalid message format', { requestId })
        return new Response('Invalid message format: must be a JSON object', { status: 400 })
      }
    } catch (err) {
      this.metrics.increment('error_invalid_json')
      this.logger.warn('Invalid JSON in request body', {
        requestId,
        error: (err as Error).message,
      })
      return new Response('Invalid JSON in request body', { status: 400 })
    }

    const id = crypto.randomUUID()
    const jsonData = JSON.stringify(data)
    const message = this.encoder.encode(`id: ${id}\ndata: ${jsonData}\n\n`)

    // Store message for reconnection support
    this.storeMessage(id, jsonData)

    // Broadcast to all connected clients
    const broadcastPromises: Promise<void>[] = []
    const now = Date.now()
    let staleCount = 0
    let successCount = 0
    let failureCount = 0

    // Clean up stale connections (no activity for 2 minutes)
    const staleThreshold = now - 120000

    for (const [sessionId, session] of this.sessions.entries()) {
      // Check for stale connections
      if (session.lastActivity < staleThreshold) {
        await this.closeClientSession(sessionId, 'stale connection')
        staleCount++
        continue
      }

      // Update last activity time
      session.lastActivity = now

      broadcastPromises.push(
        session.writer
          .write(message)
          .then(() => {
            successCount++
          })
          .catch((err) => {
            failureCount++
            this.logger.error('Error sending to client', err, {
              sessionId,
            })
            this.closeClientSession(sessionId, 'broadcast error')
          })
      )
    }

    // Wait for all broadcasts to complete
    await Promise.allSettled(broadcastPromises)

    const broadcastDuration = this.metrics.endTimer(`broadcast_${requestId}`)
    this.metrics.increment('broadcast_complete')
    this.metrics.increment('broadcast_success', successCount)
    this.metrics.increment('broadcast_failure', failureCount)
    this.metrics.increment('stale_connections_removed', staleCount)

    this.logger.info('Broadcast complete', {
      requestId,
      messageId: id,
      channel: this.channelName,
      clientCount: this.sessions.size,
      successCount,
      failureCount,
      staleCount,
      duration: broadcastDuration,
      dataSize: jsonData.length,
    })

    return new Response(
      JSON.stringify({
        success: true,
        clients: this.sessions.size,
        messageId: id,
        metrics: {
          duration: broadcastDuration,
          successCount,
          failureCount,
          staleCount,
        },
      }),
      {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    )
  }

  /**
   * Close a client session and clean up resources
   * @param sessionId The ID of the session to close
   * @param reason The reason for closing the session (for logging)
   * @returns A promise that resolves when the session is closed
   */
  private async closeClientSession(sessionId: string, reason: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      await session.writer.close()
    } catch (err) {
      this.logger.error('Error closing writer', err as Error, {
        sessionId,
        reason,
      })
    } finally {
      this.sessions.delete(sessionId)
      this.metrics.increment('client_disconnected')
      this.metrics.increment(`disconnect_reason_${reason.replace(/\s+/g, '_')}`)

      this.logger.info('Client disconnected', {
        sessionId,
        reason,
        channel: this.channelName,
        clientCount: this.sessions.size,
        connectionDuration: Date.now() - session.connectedAt,
      })
    }
  }

  // Store a message for reconnection support
  private storeMessage(id: string, data: string): void {
    // Add new message
    this.recentMessages.push({
      id,
      data,
      timestamp: Date.now(),
    })

    this.metrics.increment('message_stored')

    // Trim if we have too many messages
    if (this.recentMessages.length > this.MAX_STORED_MESSAGES) {
      this.recentMessages.shift() // Remove oldest message
      this.metrics.increment('message_trimmed')
    }
  }

  /**
   * Handle alarm events for sending pings to all connected clients
   */
  async handleAlarm() {
    const now = Date.now()
    this.logger.debug('Alarm triggered', {
      channel: this.channelName,
      clientCount: this.sessions.size,
    })

    // Send pings to all connected clients
    let pingCount = 0
    let failCount = 0

    for (const [sessionId, session] of this.sessions.entries()) {
      try {
        this.logger.debug('Sending ping to client', {
          sessionId,
          channel: this.channelName,
          timestamp: new Date(now).toISOString(),
        })

        // Send a proper ping event that clients can listen for
        const pingMsg = this.encoder.encode(
          `event: ping\nid: ping-${now}\ndata: {"time": ${now}, "channel": "${this.channelName}"}\n\n`
        )
        await session.writer.ready
        await session.writer.write(pingMsg)

        // Also send a comment ping for compatibility
        await session.writer.ready
        await session.writer.write(this.encoder.encode(`:ping ${now}\n\n`))

        session.lastActivity = now
        pingCount++
        this.metrics.increment('ping_sent')
        this.logger.debug('Ping sent successfully', { sessionId })
      } catch (err) {
        failCount++
        this.metrics.increment('ping_failed')
        this.logger.warn('Ping failed', {
          sessionId,
          error: (err as Error).message,
        })
        await this.closeClientSession(sessionId, 'ping failed')
      }
    }

    this.logger.debug('Ping results', {
      channel: this.channelName,
      pingCount,
      failCount,
    })

    // Schedule the next alarm if we have active connections
    if (this.sessions.size > 0) {
      this.storage.setAlarm(Date.now() + this.PING_INTERVAL_MS)
    }
  }
}
