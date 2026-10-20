import { storedEvent, uniqueId } from '../../test-utils/integration'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { readEvent, readLiveEvent } from './eventRepository'

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
