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

  it('reads the latest earlier entry end of the event type through gsiEventTypeEntryEndDate', async () => {
    const eventType = uniqueId('type')
    await client.batchWrite([
      seed(eventType, '2026-03-01T21:59:59.999Z'),
      seed(eventType, '2026-05-01T20:59:59.999Z'),
      seed(uniqueId('other-type'), '2026-05-20T20:59:59.999Z'),
    ])

    await expect(findQualificationStartDate(eventType, '2026-06-01T20:59:59.999Z')).resolves.toBe(
      '2026-05-02T00:00:00.000+03:00'
    )
    await expect(findQualificationStartDate(eventType, '2026-04-01T20:59:59.999Z')).resolves.toBe(
      '2026-03-02T00:00:00.000+02:00'
    )
  })

  it('finds nothing when no entry of the type ended earlier', async () => {
    const eventType = uniqueId('type')
    await client.write(seed(eventType, '2026-05-01T20:59:59.999Z'))

    await expect(findQualificationStartDate(eventType, '2026-05-01T20:59:59.999Z')).resolves.toBeUndefined()
  })

  // A known bug (KOE-1554): the reader expects `entryOrigEndDate` (the entry end before it was
  // extended, as PutEvent stores it), but the index projects `origEntryEndDate`, a name nothing
  // writes, so the original entry end date never reaches the reader and the extended one is used
  // instead. The fix is the projection's attribute name in template/tables/event-table.yaml, and a
  // projection cannot be changed in place: deploy work outside this change. This test is written to
  // the intended behaviour and marked as failing, so it turns red the day the projection is fixed.
  it.fails('counts from the original entry end date when the entry was extended (KOE-1554)', async () => {
    const eventType = uniqueId('type')
    await client.write(seed(eventType, '2026-05-20T20:59:59.999Z', '2026-05-10T20:59:59.999Z'))

    await expect(findQualificationStartDate(eventType, '2026-06-01T20:59:59.999Z')).resolves.toBe(
      '2026-05-11T00:00:00.000+03:00'
    )
  })
})
