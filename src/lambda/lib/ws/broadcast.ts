import type { SendOutcome } from './gatewaySender'
import type { WebSocketConnection } from './types'
import { mapWithConcurrency } from '../../../lib/utils'
import { logger } from '../../lib/log'
import { sendToConnection } from './gatewaySender'

type BroadcastArgs<TPayload> = {
  audience: () => Promise<WebSocketConnection[]>
  buildPayload: (audience: WebSocketConnection[], recipient: WebSocketConnection) => TPayload
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

  const counts = { attempted: 0, failed: 0, gone: 0, sent: 0 }

  const deliver = async (recipient: WebSocketConnection) => {
    const { connectionId } = recipient
    counts.attempted += 1
    let outcome: SendOutcome
    try {
      const data = Buffer.from(JSON.stringify(buildPayload(recipients, recipient)))
      outcome = await send(connectionId, data)
    } catch (error) {
      counts.failed += 1
      logger.error('ws.broadcast.unexpected-error', { connectionId, error })
      return
    }
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
  }

  // A recipient's own failure (the gone-connection cleanup rejecting) ends only that recipient, as
  // the batches' allSettled did before the pool.
  await mapWithConcurrency(recipients, concurrency, (recipient) =>
    deliver(recipient).catch((error: unknown) =>
      logger.error('ws.broadcast.unexpected-error', { connectionId: recipient.connectionId, error })
    )
  )

  logger.info('ws.broadcast.summary', { ...counts })
  return counts
}
