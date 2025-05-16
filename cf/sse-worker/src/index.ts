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

    const upstream = await fetch(`${env.UPSTASH_REDIS_REST_URL}/subscribe/${channel}`, {
      method: 'POST', // Upstash expects POST for SUBSCRIBE
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        Accept: 'text/event-stream',
      },
    })

    if (!upstream.ok || !upstream.body) {
      // Usually happens on wrong token/channel etc.
      return new Response(`Upstream error: ${await upstream.text()}`, { status: 502 })
    }

    // Create a ReadableStream with keep-alive functionality
    const reader = upstream.body!.getReader()
    const encoder = new TextEncoder()
    const pingMsg = encoder.encode(':ping\n\n')
    let lastMessageTime = Date.now()
    const keepAliveInterval = 30000 // 30 seconds

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          // Check if we need to send a keep-alive
          const now = Date.now()
          if (now - lastMessageTime > keepAliveInterval) {
            controller.enqueue(pingMsg)
            lastMessageTime = now
            return
          }

          // Otherwise read from the upstream
          const { value, done } = await reader.read()

          if (done) {
            controller.close()
            return
          }

          controller.enqueue(value)
          lastMessageTime = Date.now()
        } catch (error) {
          controller.error(error)
        }
      },

      cancel() {
        reader.cancel()
      }
    })

    return new Response(stream, {
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
