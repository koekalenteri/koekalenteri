/* eslint-disable prettier/prettier */
export interface Env {
	UPSTASH_REDIS_REST_URL: string;
	UPSTASH_REDIS_REST_TOKEN: string;
}

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

    const controller = new AbortController()
    req.signal.addEventListener('abort', () => controller.abort())

    // Pass client abort signal to upstream fetch to abort if client disconnects
    const upstream = await fetch(`${env.UPSTASH_REDIS_REST_URL}/subscribe/${channel}`, {
      method: 'POST', // Upstash expects POST for SUBSCRIBE
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        Accept: 'text/event-stream',
      },
      signal: req.signal,
    })

    if (!upstream.ok || !upstream.body) {
      // Usually happens on wrong token/channel etc.
      return new Response(`Upstream error: ${await upstream.text()}`, { status: 502 })
    }

    const reader = upstream.body.getReader()
    const encoder = new TextEncoder()
    const pingMsg = encoder.encode(':ping\n\n')
    let lastMessageTime = Date.now()

    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    req.signal.addEventListener('abort', () => {
      reader.cancel().catch(() => {})
      writer.close().catch(() => {})
    })

    const pump = async () => {
      try {
        while (!req.signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          lastMessageTime = Date.now()
          await writer.write(value)
        }
      } catch (err) {
        // Ignore abort errors from cancellation
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Upstream read error:', err)
        }
      } finally {
        try {
          await writer.close()
        } catch {
          // eat
        }
      }
    }

    const pinger = async () => {
      try {
        while (!req.signal.aborted) {
          await new Promise((r) => setTimeout(r, 1000))
          if (Date.now() - lastMessageTime >= 30000) {
            await writer.write(pingMsg)
            lastMessageTime = Date.now()
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Ping loop error:', err)
        }
      }
    }

    ctx.waitUntil(pump())
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
