/* eslint-disable prettier/prettier */
import { Redis } from '@upstash/redis/cloudflare'

export interface Env {
	UPSTASH_REDIS_REST_URL: string;
	UPSTASH_REDIS_REST_TOKEN: string;
}

let redis: Redis

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    redis ??= new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })

    const { searchParams } = new URL(req.url)
    const channel = searchParams.get('channel')

    if (!channel) {
      return new Response('Missing ?channel= parameter', { status: 400 })
    }

		const { readable, writable } = new TransformStream()
		const writer = writable.getWriter()
		const encoder = new TextEncoder()

		const streamSSE = async () => {
			const sub = redis.subscribe(channel)
			for await (const msg of sub as unknown as AsyncIterable<unknown>) {
				await writer.write(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`))
			}
		}

		streamSSE()

		return new Response(readable, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
			},
		})
	},
}
