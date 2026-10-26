import { storedEvent, uniqueId } from '../../test-utils/integration'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { findEventCopy, readEvent, readLiveEvent } from './eventRepository'

/**
 * A deleted event keeps its row, with `deletedAt`: the admin readers still read it, the public ones
 * get no event (KOE-1586).
 */
describe('readLiveEvent against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventTable')

  it('reads a live event as stored', async () => {
    const live = storedEvent()
    await client.write(live)

    await expect(readLiveEvent(live.id, true)).resolves.toEqual(live)
  })

  it('answers a deleted event as no event, while readEvent still reads its row', async () => {
    const deleted = storedEvent({ deletedAt: new Date().toISOString(), deletedBy: 'secretary' })
    await client.write(deleted)

    await expect(readLiveEvent(deleted.id, true)).resolves.toBeUndefined()
    await expect(readEvent(deleted.id, true)).resolves.toEqual(deleted)
  })

  it('answers an id with no row as no event', async () => {
    await expect(readLiveEvent(uniqueId('event'), true)).resolves.toBeUndefined()
  })
})

/**
 * An event copied from another environment holds `copiedFrom` (KOE-1471); a second copy of the same
 * source is refused while a live copy exists (KOE-1639).
 */
describe('findEventCopy against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventTable')
  const copiedFrom = (stage: string, eventId: string) => ({ at: new Date().toISOString(), by: 'Admin', eventId, stage })

  it('finds the live copy of the source and none of the others', async () => {
    const sourceId = uniqueId('source')
    const live = storedEvent({ copiedFrom: copiedFrom('prod', sourceId), name: '[Kopio: prod] Live' })
    const deleted = storedEvent({
      copiedFrom: copiedFrom('prod', sourceId),
      deletedAt: new Date().toISOString(),
      deletedBy: 'admin',
    })
    const otherStage = storedEvent({ copiedFrom: copiedFrom('test', sourceId) })
    const otherEvent = storedEvent({ copiedFrom: copiedFrom('prod', uniqueId('source')) })
    for (const row of [live, deleted, otherStage, otherEvent]) await client.write(row)

    await expect(findEventCopy({ eventId: sourceId, stage: 'prod' })).resolves.toEqual({
      id: live.id,
      name: '[Kopio: prod] Live',
    })
  })

  it('finds nothing once the only copy is deleted', async () => {
    const sourceId = uniqueId('source')
    await client.write(
      storedEvent({ copiedFrom: copiedFrom('dev', sourceId), deletedAt: new Date().toISOString(), deletedBy: 'admin' })
    )

    await expect(findEventCopy({ eventId: sourceId, stage: 'dev' })).resolves.toBeUndefined()
  })
})
