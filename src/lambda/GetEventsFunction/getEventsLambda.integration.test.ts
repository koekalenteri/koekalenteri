import type { JsonDogEvent } from '../../types'
import { addDays } from 'date-fns'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { getEventSeason } from '../../lib/event'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import getEventsLambda from './handler'

/** A stored event, in the season gsiSeasonStartDate is keyed on, two weeks from now unless told otherwise. */
const storedEvent = (overrides: Partial<JsonDogEvent> = {}): JsonDogEvent => {
  const startDate = overrides.startDate ?? addDays(new Date(), 14).toISOString()
  const organizerId = uniqueId('org')
  return {
    ...JSON.parse(JSON.stringify(eventWithParticipantsInvited)),
    endDate: startDate,
    id: uniqueId('event'),
    organizer: { id: organizerId, name: 'Integration ry' },
    organizerId,
    season: getEventSeason(startDate),
    startDate,
    state: 'confirmed',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const idsIn = (body: string) => JSON.parse(body).map((event: { id: string }) => event.id)

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

  it('keeps an asked range to the events in it', async () => {
    const inRange = storedEvent({ startDate: addDays(new Date(), 30).toISOString() })
    const later = storedEvent({ startDate: addDays(new Date(), 60).toISOString() })
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
