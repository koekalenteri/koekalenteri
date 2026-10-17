import type { JsonUser } from '../../types'
import { addDays } from 'date-fns'
import { vi } from 'vitest'
import { freezeClockAt } from '../../test-utils/freezeClock'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { idsIn, storedEvent, storedUser, uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// Authorization is the one boundary replaced: who asks decides which index is read.
const mockAuthorizeWithMemberOf = vi.fn<() => Promise<{ memberOf: string[]; user: JsonUser }>>()
vi.doMock('../lib/auth', () => ({ authorizeWithMemberOf: mockAuthorizeWithMemberOf }))

const { default: getAdminEventsLambda } = await import('./handler')

// Pinned mid-year: an event two weeks ahead belongs to next season from 18.12 on, and the handler's
// `since` query reads seasons only up to the current year, so from then until New Year the changed
// event is not found. That is a handler bug (KOE-1555), not this test's; the clock keeps the test
// about the index until the handler is fixed.
const now = freezeClockAt('2026-06-15')
const inDays = (days: number) => addDays(new Date(now), days).toISOString()

describe('getAdminEventsLambda against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventTable')
  const event = constructAPIGwEvent(undefined, { query: {} })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reads a club administrator's own events through gsiOrganizerStartDate, in start order", async () => {
    const organizerId = uniqueId('org')
    const later = storedEvent({ organizerId, startDate: inDays(30), updatedAt: inDays(0) })
    const earlier = storedEvent({ organizerId, startDate: inDays(10), updatedAt: inDays(0) })
    const other = storedEvent({ startDate: inDays(14), updatedAt: inDays(0) })
    await client.batchWrite([later, earlier, other])
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [organizerId], user: storedUser() })

    const result = await getAdminEventsLambda(event)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([earlier, later])
  })

  it('walks the seasons through gsiSeasonStartDate for a superadmin', async () => {
    const own = storedEvent({ startDate: inDays(14), updatedAt: inDays(0) })
    await client.write(own)
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: storedUser({ admin: true }) })

    const result = await getAdminEventsLambda(event)

    expect(result.statusCode).toBe(200)
    expect(idsIn(result.body)).toContain(own.id)
  })

  it('reads what changed since a moment through gsiSeasonUpdatedAt', async () => {
    const since = now - 60_000
    const changed = storedEvent({ startDate: inDays(14), updatedAt: inDays(0) })
    const unchanged = storedEvent({ startDate: inDays(14), updatedAt: inDays(-1) })
    await client.batchWrite([changed, unchanged])
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: storedUser({ admin: true }) })

    const result = await getAdminEventsLambda(constructAPIGwEvent(undefined, { query: { since: String(since) } }))

    expect(result.statusCode).toBe(200)
    const ids = idsIn(result.body)
    expect(ids).toContain(changed.id)
    expect(ids).not.toContain(unchanged.id)
  })
})
