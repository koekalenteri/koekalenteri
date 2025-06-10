/* eslint-disable prettier/prettier */
export interface Env {
	UPSTASH_REDIS_REST_URL: string;
	UPSTASH_REDIS_REST_TOKEN: string;
}

type RedisStreamMessage = [string, Array<[string, string[]]>]

const getCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
}

const optionsCorsHeaders = {
  ...getCorsHeaders,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: optionsCorsHeaders,
      })
    }

    const { searchParams } = new URL(req.url)
    const channel = searchParams.get('channel')

    if (!channel || !/^[a-zA-Z0-9-_]+$/.test(channel)) {
      return new Response('Invalid channel name', { status: 400 })
    }

    const encoder = new TextEncoder()
    const pingMsg = encoder.encode(':ping\n\n')

    let lastId = '$'
    let lastMessageTime = Date.now()

    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Track writer state for debugging
    let writerClosed = false
    let writerClosing = false

    req.signal.addEventListener('abort', () => {
      console.log('Request aborted, closing writer')
      if (!writerClosed && !writerClosing) {
        writerClosing = true
        writer.close().then(() => {
          writerClosed = true
          console.log('Writer closed on abort')
        }).catch((err) => {
          console.error('Error closing writer on abort:', err)
          writerClosed = true // Mark as closed even if there was an error
        })
      } else {
        console.log('Writer already closed or closing, skipping close on abort')
      }
    })

    const pinger = async () => {
      try {
        while (!req.signal.aborted && !writerClosed && !writerClosing) {
          await new Promise((r) => setTimeout(r, 5000))
          if (Date.now() - lastMessageTime >= 30000 && !writerClosed && !writerClosing) {
            try {
              await writer.write(pingMsg)
              lastMessageTime = Date.now()
            } catch (writeErr) {
              console.log('Error writing ping, exiting ping loop:', writeErr)
              break // Exit the loop if we can't write
            }
          }
        }
        console.log('Ping loop exited normally')
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Ping loop error:', err)
        }
      }
    }

    // Polling loop with reconnect & backoff
    const poller = async () => {
      let backoff = 1000
      let retryCount = 0
      const MAX_RETRIES = 50 // Prevent infinite retries

      console.log(`Starting poller loop with MAX_RETRIES=${MAX_RETRIES}`)

      while (!req.signal.aborted && retryCount < MAX_RETRIES) {
        try {
          const url = `${env.UPSTASH_REDIS_REST_URL}/xread/streams/${channel}/${lastId}`
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
              Accept: 'application/json',
            },
            signal: req.signal,
          })

          if (!res.ok) {
            throw new Error(`Upstash error: ${await res.text()}`)
          }

          const json = await res.json<RedisStreamMessage[] | null>()

          const [streamName, messages] = json?.[0] || []
          if (Array.isArray(messages)) {
            for (const [id, dataArray] of messages) {
              const data: Record<string, string> = {}
              for (let i = 0; i < dataArray.length; i += 2) {
                data[dataArray[i]] = dataArray[i + 1]
              }

              const payload = `id: ${id}\ndata: ${JSON.stringify(data)}\n\n`
              await writer.write(encoder.encode(payload))
              lastId = id
              lastMessageTime = Date.now()
              backoff = 1000 // reset on success
            }
          }

          // Longer wait between polls to avoid rate limiting
          await new Promise((r) => setTimeout(r, 1000))
          retryCount = 0 // Reset retry count on success
        } catch (err) {
          if (req.signal.aborted) break

          retryCount++
          const errorMessage = err instanceof Error ? err.message : String(err)
          const isRateLimited = errorMessage.includes('Too many') || errorMessage.includes('rate limit')

          console.error(`Polling error (${retryCount}/${MAX_RETRIES}):`, err)

          // Use longer backoff for rate limiting errors
          if (isRateLimited) {
            backoff = Math.min(backoff * 2, 30000) // Longer max backoff for rate limits
          } else {
            backoff = Math.min(backoff * 1.5, 15000) // Standard backoff for other errors
          }

          // Wait before retrying
          await new Promise((r) => setTimeout(r, backoff))
        }
      }

      // If we exited due to max retries, send an error message to the client
      if (retryCount >= MAX_RETRIES && !req.signal.aborted && !writerClosed) {
        try {
          // Check if writer is already closed
          if (writer.desiredSize === null || writerClosed) {
            console.log('Writer is already closed, skipping error message')
          } else {
            const errorMsg = `event: error\ndata: {"message": "Connection closed after ${MAX_RETRIES} failed retries"}\n\n`

            // Use a timeout to prevent hanging indefinitely
            const writePromise = writer.write(encoder.encode(errorMsg))
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout writing error message')), 1000)
            )

            try {
              await Promise.race([writePromise, timeoutPromise])
              console.log('Error message written successfully')
            } catch (writeErr) {
              console.error('Timed out or error writing message:', writeErr)
              // Continue with cleanup even if write fails
            }

            console.log('Error message sent')
          }
        } catch (e) {
          console.error('Failed to send error message:', e)
        }
      } else {
        console.log(`Skipping error message: retryCount=${retryCount}, aborted=${req.signal.aborted}, writerClosed=${writerClosed}`)
      }

      // Only close the writer if it's not already closed or closing
      if (!writerClosed && !writerClosing) {
        console.log('Closing writer')
        try {
          writerClosing = true
          const closePromise = writer.close()
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout closing writer')), 1000)
          )

          await Promise.race([closePromise, timeoutPromise])
          writerClosed = true
          console.log('Writer closed successfully')
        } catch (closeErr) {
          console.error('Error or timeout closing writer:', closeErr)
          writerClosed = true // Mark as closed even if there was an error
        }
      } else {
        console.log('Writer already closed or closing, skipping close')
      }
    }

    ctx.waitUntil(poller())
    ctx.waitUntil(pinger())

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...getCorsHeaders
      },
    })
	},
}
