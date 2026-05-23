import type { WebSocketConnection } from './types'
import { type SendOutcome, sendToConnection } from './gatewaySender'

type BroadcastArgs<TPayload> = {
  audience: () => Promise<WebSocketConnection[]>
  buildPayload: (audience: WebSocketConnection[]) => TPayload
  concurrency?: number
  onGoneConnection?: (id: string) => Promise<void>
  send?: (connectionId: string, data: Buffer) => Promise<SendOutcome>
  log?: (info: { audience: number }) => void
}

const DEFAULT_BROADCAST_CONCURRENCY = 100

export const broadcast = async <TPayload>({
  audience,
  buildPayload,
  concurrency = DEFAULT_BROADCAST_CONCURRENCY,
  onGoneConnection,
  send = sendToConnection,
  log,
}: BroadcastArgs<TPayload>) => {
  const recipients = await audience()
  log?.({ audience: recipients.length })

  const data = Buffer.from(JSON.stringify(buildPayload(recipients)))
  const counts = { attempted: 0, failed: 0, gone: 0, sent: 0 }
  const limit = Math.max(1, Math.floor(concurrency))

  for (let offset = 0; offset < recipients.length; offset += limit) {
    const batch = recipients.slice(offset, offset + limit)
    await Promise.allSettled(
      batch.map(async ({ connectionId }) => {
        counts.attempted += 1
        const outcome = await send(connectionId, data)
        if (outcome === 'sent') {
          counts.sent += 1
          return
        }
        if (outcome === 'gone') {
          counts.gone += 1
          await onGoneConnection?.(connectionId)
          return
        }
        counts.failed += 1
      })
    )
  }

  console.log('ws.broadcast.summary', counts)
  return counts
}
