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
      seed(eventType, '2026-03-01'),
      seed(eventType, '2026-05-01'),
      seed(uniqueId('other-type'), '2026-05-20'),
    ])

    // The day after the entry closed, as a key (KOE-1547).
    await expect(findQualificationStartDate(eventType, '2026-06-01')).resolves.toBe('2026-05-02')
    await expect(findQualificationStartDate(eventType, '2026-04-01')).resolves.toBe('2026-03-02')
  })

  // KOE-1585: a deleted trial is no previous trial. The index projects no deletedAt, so the reader
  // has to ask the row.
  it("skips a deleted event's entry end", async () => {
    const eventType = uniqueId('type')
    const deleted = { ...seed(eventType, '2026-05-01'), deletedAt: '2026-04-20T10:00:00.000Z' }
    await client.batchWrite([seed(eventType, '2026-03-01'), deleted])

    await expect(findQualificationStartDate(eventType, '2026-06-01')).resolves.toBe('2026-03-02')
  })

  it('takes a live event whose entry closed the same day as a deleted one', async () => {
    const eventType = uniqueId('type')
    // The index answers rows with the same entry end in no set order. Whichever comes first, the live
    // one must answer; with four deleted beside it, a deleted one mostly comes first, and a bound of
    // `<` its day alone would pass over the live one. The unit test pins that path.
    const deleted = [1, 2, 3, 4].map(() => ({
      ...seed(eventType, '2026-05-01'),
      deletedAt: '2026-04-20T10:00:00.000Z',
    }))
    await client.batchWrite([seed(eventType, '2026-03-01'), ...deleted, seed(eventType, '2026-05-01', '2026-04-25')])

    // 26.4., the day after the live one's original entry end.
    await expect(findQualificationStartDate(eventType, '2026-06-01')).resolves.toBe('2026-04-26')
  })

  it('finds nothing when no entry of the type ended on an earlier day', async () => {
    const eventType = uniqueId('type')
    await client.write(seed(eventType, '2026-05-01'))

    await expect(findQualificationStartDate(eventType, '2026-05-01')).resolves.toBeUndefined()
  })

  // KOE-1547: the bound is the day key. A row stored before keeps the end of its Finnish day as an
  // instant, which sorts after the key of that day and before the next day's key.
  it("takes a row not yet migrated by its day, and not one that closed the bound's own day", async () => {
    const eventType = uniqueId('type')
    await client.batchWrite([seed(eventType, '2026-05-01T20:59:59.999Z'), seed(eventType, '2026-06-01T20:59:59.999Z')])

    await expect(findQualificationStartDate(eventType, '2026-06-01')).resolves.toBe('2026-05-02')
  })

  // PutEvent keeps the entry end before an extension in `entryOrigEndDate`; the qualification period
  // counts from that day, so the index the reader queries must project the field (KOE-1554).
  it('counts from the original entry end date when the entry was extended (KOE-1554)', async () => {
    const eventType = uniqueId('type')
    await client.write(seed(eventType, '2026-05-20', '2026-05-10'))

    // 11.5., the day after the original entry end.
    await expect(findQualificationStartDate(eventType, '2026-06-01')).resolves.toBe('2026-05-11')
  })
})
