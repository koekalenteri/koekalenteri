import { addDays } from 'date-fns'
import { addDays as addDayKeys, dayOf, TIME_ZONE } from '../../lib/day'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { idsIn, storedEvent } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import getEventsLambda from './handler'

describe('getEventsLambda against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventTable')

  it('reads the season through gsiSeasonStartDate and leaves the drafts to the database', async () => {
    const confirmed = storedEvent()
    const draft = storedEvent({ state: 'draft' })
    await client.batchWrite([confirmed, draft])

    const result = await getEventsLambda(constructAPIGwEvent(undefined, { query: {} }))

    expect(result.statusCode).toBe(200)
    const ids = idsIn(result.body)
    expect(ids).toContain(confirmed.id)
    expect(ids).not.toContain(draft.id)
    // The public list carries no organizer key
    expect(JSON.parse(result.body).find((event: { id: string }) => event.id === confirmed.id)).not.toHaveProperty(
      'organizerId'
    )
  })

  // KOE-1585: a deleted event keeps its season, and so its place in gsiSeasonStartDate.
  it('leaves the deleted events out of the list and out of a since answer', async () => {
    const live = storedEvent()
    const deleted = storedEvent({ deletedAt: new Date().toISOString(), deletedBy: 'secretary' })
    await client.batchWrite([live, deleted])

    const full = await getEventsLambda(constructAPIGwEvent(undefined, { query: {} }))
    expect(idsIn(full.body)).toContain(live.id)
    expect(idsIn(full.body)).not.toContain(deleted.id)

    // A browser that holds the event drops it when the answer neither changes nor vouches for it.
    const since = await getEventsLambda(
      constructAPIGwEvent(undefined, { query: { since: String(Date.now() - 60 * 60 * 1000) } })
    )
    const { events, unchangedIds } = JSON.parse(since.body)
    const answered = [...events.map((event: { id: string }) => event.id), ...unchangedIds]
    expect(answered).toContain(live.id)
    expect(answered).not.toContain(deleted.id)
  })

  it('keeps an asked range to the events in it', async () => {
    const today = dayOf(new Date(), TIME_ZONE)
    const inRange = storedEvent({ startDate: addDayKeys(today, 30) })
    const later = storedEvent({ startDate: addDayKeys(today, 60) })
    await client.batchWrite([inRange, later])

    const result = await getEventsLambda(
      constructAPIGwEvent(undefined, {
        query: { end: addDays(new Date(), 45).toISOString(), start: addDays(new Date(), 20).toISOString() },
      })
    )

    const ids = idsIn(result.body)
    expect(ids).toContain(inRange.id)
    expect(ids).not.toContain(later.id)
  })
})
