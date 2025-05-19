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

    req.signal.addEventListener('abort', () => {
      writer.close().catch(() => {})
    })

    const pinger = async () => {
      try {
        while (!req.signal.aborted) {
          await new Promise((r) => setTimeout(r, 5000))
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

    // Polling loop with reconnect & backoff
    const poller = async () => {
      let backoff = 1000
      while (!req.signal.aborted) {
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

          // Short wait between polls (tweak to your needs)
          await new Promise((r) => setTimeout(r, 100))
        } catch (err) {
          if (req.signal.aborted) break

          console.error('Polling error:', err)
          // Wait before retrying (exponential backoff with cap)
          await new Promise((r) => setTimeout(r, backoff))
          backoff = Math.min(backoff * 2, 15000)
        }
      }

      writer.close().catch(() => {})
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
