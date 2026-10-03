import type { SendOutcome } from './gatewaySender'
import type { WebSocketConnection } from './types'
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

  // A pool of `concurrency` workers, each taking the next recipient as soon as its own is done, so
  // one slow connection holds up one worker rather than a whole batch. A worker's own failure (the
  // gone-connection cleanup rejecting) ends only that recipient, as the batches' allSettled did.
  let next = 0
  const work = async (): Promise<void> => {
    const recipient = recipients[next++]
    if (!recipient) return
    await deliver(recipient).catch((error: unknown) =>
      logger.error('ws.broadcast.unexpected-error', { connectionId: recipient.connectionId, error })
    )
    return work()
  }
  const workers = Math.min(Math.max(1, Math.floor(concurrency)), recipients.length)
  await Promise.all(Array.from({ length: workers }, work))

  logger.info('ws.broadcast.summary', { ...counts })
  return counts
}
