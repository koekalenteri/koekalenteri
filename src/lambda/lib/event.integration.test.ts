import { uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { findQualificationStartDate } from './event'

interface EntryEndDates {
  entryEndDate: string
  entryOrigEndDate?: string
  eventType: string
  id: string
}

describe('findQualificationStartDate against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventTable')

  const seed = (eventType: string, entryEndDate: string, entryOrigEndDate?: string): EntryEndDates => ({
    entryEndDate,
    ...(entryOrigEndDate ? { entryOrigEndDate } : {}),
    eventType,
    id: uniqueId('event'),
  })

  it('reads the latest earlier entry end of the event type through gsiEventTypeEntryEndDateV2', async () => {
    const eventType = uniqueId('type')
    await client.batchWrite([
      seed(eventType, '2026-03-01T21:59:59.999Z'),
      seed(eventType, '2026-05-01T20:59:59.999Z'),
      seed(uniqueId('other-type'), '2026-05-20T20:59:59.999Z'),
    ])

    // The Finnish day after the entry closed, from its start, as the UTC instant the events store.
    await expect(findQualificationStartDate(eventType, '2026-06-01T20:59:59.999Z')).resolves.toBe(
      '2026-05-01T21:00:00.000Z'
    )
    await expect(findQualificationStartDate(eventType, '2026-04-01T20:59:59.999Z')).resolves.toBe(
      '2026-03-01T22:00:00.000Z'
    )
  })

  it('finds nothing when no entry of the type ended earlier', async () => {
    const eventType = uniqueId('type')
    await client.write(seed(eventType, '2026-05-01T20:59:59.999Z'))

    await expect(findQualificationStartDate(eventType, '2026-05-01T20:59:59.999Z')).resolves.toBeUndefined()
  })

  // PutEvent keeps the entry end before an extension in `entryOrigEndDate`; the qualification period
  // counts from that day, so the index the reader queries must project the field (KOE-1554).
  it('counts from the original entry end date when the entry was extended (KOE-1554)', async () => {
    const eventType = uniqueId('type')
    await client.write(seed(eventType, '2026-05-20T20:59:59.999Z', '2026-05-10T20:59:59.999Z'))

    // The start of 11.5. in Finland, the day after the original entry end.
    await expect(findQualificationStartDate(eventType, '2026-06-01T20:59:59.999Z')).resolves.toBe(
      '2026-05-10T21:00:00.000Z'
    )
  })
})
