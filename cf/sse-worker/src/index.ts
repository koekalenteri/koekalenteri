/* eslint-disable prettier/prettier */
export interface Env {
	UPSTASH_REDIS_REST_URL: string;
	UPSTASH_REDIS_REST_TOKEN: string;
}

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext) {
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

    // Pipe the SSE stream verbatim to the client.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // Simple public CORS – adjust as needed.
        'Access-Control-Allow-Origin': '*',
      },
    })

	},
}
