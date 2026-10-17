import type { JsonDogEvent, JsonUser } from '../../types'
import { addDays } from 'date-fns'
import { vi } from 'vitest'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { getEventSeason } from '../../lib/event'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// Authorization is the one boundary replaced: who asks decides which index is read.
const mockAuthorizeWithMemberOf = vi.fn<() => Promise<{ memberOf: string[]; user: JsonUser }>>()
vi.doMock('../lib/auth', () => ({ authorizeWithMemberOf: mockAuthorizeWithMemberOf }))

const { default: getAdminEventsLambda } = await import('./handler')

const user = (overrides: Partial<JsonUser> = {}): JsonUser => {
  const id = uniqueId('user')
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'test',
    email: `${id}@example.com`,
    id,
    modifiedAt: '2026-01-01T00:00:00.000Z',
    modifiedBy: 'test',
    name: `User ${id}`,
    ...overrides,
  }
}

/** A stored event of the given club, in the season the index keys are derived from. */
const storedEvent = (organizerId: string, overrides: Partial<JsonDogEvent> = {}): JsonDogEvent => {
  const startDate = overrides.startDate ?? addDays(new Date(), 14).toISOString()
  return {
    ...JSON.parse(JSON.stringify(eventWithParticipantsInvited)),
    endDate: startDate,
    id: uniqueId('event'),
    organizer: { id: organizerId, name: `Club ${organizerId}` },
    organizerId,
    season: getEventSeason(startDate),
    startDate,
    state: 'confirmed',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const idsIn = (body: string) => JSON.parse(body).map((event: { id: string }) => event.id)

describe('getAdminEventsLambda against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventTable')
  const event = constructAPIGwEvent(undefined, { query: {} })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reads a club administrator's own events through gsiOrganizerStartDate, in start order", async () => {
    const own = uniqueId('org')
    const later = storedEvent(own, { startDate: addDays(new Date(), 30).toISOString() })
    const earlier = storedEvent(own, { startDate: addDays(new Date(), 10).toISOString() })
    const other = storedEvent(uniqueId('org'))
    await client.batchWrite([later, earlier, other])
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [own], user: user() })

    const result = await getAdminEventsLambda(event)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([earlier, later])
  })

  it('walks the seasons through gsiSeasonStartDate for a superadmin', async () => {
    const own = storedEvent(uniqueId('org'))
    await client.write(own)
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: user({ admin: true }) })

    const result = await getAdminEventsLambda(event)

    expect(result.statusCode).toBe(200)
    expect(idsIn(result.body)).toContain(own.id)
  })

  it('reads what changed since a moment through gsiSeasonUpdatedAt', async () => {
    const since = Date.now() - 60_000
    const changed = storedEvent(uniqueId('org'))
    const unchanged = storedEvent(uniqueId('org'), { updatedAt: new Date(since - 86_400_000).toISOString() })
    await client.batchWrite([changed, unchanged])
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: user({ admin: true }) })

    const result = await getAdminEventsLambda(constructAPIGwEvent(undefined, { query: { since: String(since) } }))

    expect(result.statusCode).toBe(200)
    const ids = idsIn(result.body)
    expect(ids).toContain(changed.id)
    expect(ids).not.toContain(unchanged.id)
  })
})
