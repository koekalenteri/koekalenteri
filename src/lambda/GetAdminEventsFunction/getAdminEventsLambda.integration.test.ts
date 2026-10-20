import type { JsonUser } from '../../types'
import { vi } from 'vitest'
import { addDays, dayOf, TIME_ZONE, toDayKey } from '../../lib/day'
import { freezeClockAt } from '../../test-utils/freezeClock'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { idsIn, storedEvent, storedUser, uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// Authorization is the one boundary replaced: who asks decides which index is read.
const mockAuthorizeWithMemberOf = vi.fn<() => Promise<{ memberOf: string[]; user: JsonUser }>>()
vi.doMock('../lib/auth', () => ({ authorizeWithMemberOf: mockAuthorizeWithMemberOf }))

const { default: getAdminEventsLambda } = await import('./handler')

const adminEvents = (since?: number) =>
  getAdminEventsLambda(constructAPIGwEvent(undefined, { query: since ? { since: String(since) } : {} }))

const client = new CustomDynamoClient('EventTable')

describe('getAdminEventsLambda against DynamoDB-local', () => {
  // Pinned mid-year, so every fixture two weeks ahead (the helper's default) is this season's. The
  // fixtures are built inside the tests, so the helper's defaults read the frozen clock.
  const now = freezeClockAt('2026-06-15')
  const inDays = (days: number) => addDays(dayOf(new Date(now), TIME_ZONE), days)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reads a club administrator's own events through gsiOrganizerStartDate, in start order", async () => {
    const organizerId = uniqueId('org')
    const later = storedEvent({ organizerId, startDate: inDays(30) })
    const earlier = storedEvent({ organizerId, startDate: inDays(10) })
    const other = storedEvent()
    await client.batchWrite([later, earlier, other])
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [organizerId], user: storedUser() })

    const result = await adminEvents()

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([earlier, later])
  })

  it('walks the seasons through gsiSeasonStartDate for a superadmin', async () => {
    const own = storedEvent()
    await client.write(own)
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: storedUser({ admin: true }) })

    const result = await adminEvents()

    expect(result.statusCode).toBe(200)
    expect(idsIn(result.body)).toContain(own.id)
  })

  it('reads what changed since a moment through gsiSeasonUpdatedAt', async () => {
    const since = now - 60_000
    const changed = storedEvent()
    const unchanged = storedEvent({ updatedAt: inDays(-1) })
    await client.batchWrite([changed, unchanged])
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: storedUser({ admin: true }) })

    const result = await adminEvents(since)

    expect(result.statusCode).toBe(200)
    const ids = idsIn(result.body)
    expect(ids).toContain(changed.id)
    expect(ids).not.toContain(unchanged.id)
  })

  // KOE-1585: the admin list hides a deleted event itself, and its since fetch learns of the deletion
  // from the row, so every admin read hands the deleted rows back with their deletedAt.
  describe('a deleted event', () => {
    const deletedEvent = (organizerId?: string) =>
      storedEvent({
        deletedAt: new Date(now).toISOString(),
        deletedBy: 'secretary',
        ...(organizerId ? { organizerId } : {}),
      })
    const deletedAtOf = (body: string, id: string) =>
      JSON.parse(body).find((item: { id: string }) => item.id === id)?.deletedAt

    it.each([
      ['the season walk', undefined],
      ['the since read', now - 60_000],
    ])('comes back with its deletedAt from %s', async (_, since) => {
      const deleted = deletedEvent()
      await client.write(deleted)
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: storedUser({ admin: true }) })

      const result = await adminEvents(since)

      expect(deletedAtOf(result.body, deleted.id)).toBe(deleted.deletedAt)
    })

    it("comes back with its deletedAt from a club administrator's read", async () => {
      const organizerId = uniqueId('org')
      const deleted = deletedEvent(organizerId)
      await client.write(deleted)
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [organizerId], user: storedUser() })

      const result = await adminEvents()

      expect(deletedAtOf(result.body, deleted.id)).toBe(deleted.deletedAt)
    })
  })
})

// Before New Year an event in early January is next season's: the since walk reads that season too,
// as the full read does (KOE-1555).
describe('getAdminEventsLambda against DynamoDB-local at year end', () => {
  const now = freezeClockAt('2026-12-20')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reads a change to next season's event through gsiSeasonUpdatedAt", async () => {
    const nextSeason = storedEvent({ startDate: toDayKey(2027, 1, 3) })
    expect(nextSeason.season).toBe('2027')
    await client.write(nextSeason)
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: storedUser({ admin: true }) })

    const result = await adminEvents(now - 60_000)

    expect(result.statusCode).toBe(200)
    expect(idsIn(result.body)).toContain(nextSeason.id)
  })
})
