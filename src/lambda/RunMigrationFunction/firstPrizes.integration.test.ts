import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'
import { uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// The run reads every table whole; this file's rows are the whole of it, so the run touches nothing another
// file wrote. The registry says nothing has run, so every migration runs over these rows.
let eventId = ''

vi.doMock('../lib/dataVersions', () => ({
  bumpDataVersion: vi.fn(),
  markMigrationApplied: vi.fn(),
  readAppliedMigrations: async () => new Map(),
}))
vi.doMock('../lib/repositories/eventRepository', async () => {
  const actual = await vi.importActual<typeof import('../lib/repositories/eventRepository')>(
    '../lib/repositories/eventRepository'
  )
  return {
    ...actual,
    readAllEvents: async (withDeleted?: boolean) =>
      (await actual.readAllEvents(withDeleted)).filter(({ id }) => id === eventId),
  }
})
vi.doMock('../lib/repositories/registrationRepository', async () => ({
  ...(await vi.importActual<typeof import('../lib/repositories/registrationRepository')>(
    '../lib/repositories/registrationRepository'
  )),
  readRegistrationEventIds: async () => [eventId],
}))
vi.doMock('../lib/repositories/userRepository', async () => ({
  ...(await vi.importActual<typeof import('../lib/repositories/userRepository')>('../lib/repositories/userRepository')),
  readAllUsers: async () => [],
}))
vi.doMock('../lib/repositories/dogRepository', async () => ({
  ...(await vi.importActual<typeof import('../lib/repositories/dogRepository')>('../lib/repositories/dogRepository')),
  readAllDogs: async () => [],
}))
vi.doMock('../lib/repositories/eventStatsRepository', async () => ({
  ...(await vi.importActual<typeof import('../lib/repositories/eventStatsRepository')>(
    '../lib/repositories/eventStatsRepository'
  )),
  readAllOrganizerEventStats: async () => [],
}))
vi.doMock('../lib/repositories/organizerRepository', () => ({ readOrganizersIncludingDeleted: async () => [] }))

const { default: runMigrationLambda } = await import('./handler')
const { readRegistration } = await import('../lib/repositories/registrationRepository')
const { readAuditTrail } = await import('../lib/repositories/auditRepository')

describe('restoreFirstPrizes against DynamoDB-local (KOE-1677)', () => {
  const events = new CustomDynamoClient('EventTable')
  const registrations = new CustomDynamoClient('EventRegistrationTable')
  const day = '2026-10-31'
  const at = { updatedAt: '2026-10-31T10:00:00.000Z', updatedBy: 'Sihteeri' }
  const scored = (...points: number[]) =>
    points.map((value, index) => ({ ...at, exercise: index + 1, part: 0, points: value }))

  /** A dog of the event's ALO class as a save stores it, with the result given. */
  const registration = (eventResult: Record<string, unknown>) => ({
    class: 'ALO',
    dog: { regNo: uniqueId('FI') },
    eventId,
    eventResult: { ...at, ...eventResult },
    eventType: 'NOWT',
    group: { date: day, key: `${day}-ap`, number: 1 },
    id: uniqueId('registration'),
    ownerHandles: true,
    ownerPays: true,
    updatedAt: '2026-10-31T10:00:00.000Z',
  })

  it('stores the first prize of a round at 80 % with a task under half, and keeps a second the total earns', async () => {
    eventId = uniqueId('event')
    // Four posts, one exercise of 20 each, and nothing an earlier migration would change.
    await events.write({
      classes: [{ class: 'ALO', date: day }],
      endDate: day,
      eventType: 'NOWT',
      id: eventId,
      season: '2026',
      startDate: day,
      stations: [1, 2, 3, 4].map((number) => ({ date: day, id: `post-${number}`, number })),
      updatedAt: '2026-10-31T09:00:00.000Z',
    })
    // 64 of 80 with exercise 4 at 9 of 20, stored as a second prize by the per-task floor.
    const lowered = registration({
      maxPoints: 80,
      percentage: 80,
      points: 64,
      result: 'ALO2',
      tasks: scored(20, 20, 15, 9),
    })
    // 63 of 80 is 78.75 %: a second prize by the total.
    const earned = registration({
      maxPoints: 80,
      percentage: 78.75,
      points: 63,
      result: 'ALO2',
      tasks: scored(20, 20, 14, 9),
    })
    await registrations.batchWrite([lowered, earned])

    await runMigrationLambda(constructPartialAPIGwEvent({}))

    const raised = await readRegistration(eventId, lowered.id, true)
    expect(raised?.eventResult).toEqual({ ...lowered.eventResult, result: 'ALO1' })
    expect(raised?.updatedAt).not.toBe(lowered.updatedAt)
    await expect(readRegistration(eventId, earned.id, true)).resolves.toEqual(earned)

    const [record, ...more] = await readAuditTrail(`${eventId}:${lowered.id}`)
    expect(more).toEqual([])
    expect(record).toMatchObject({
      messageKey: 'audit.messages.resultRederived',
      messageParams: { previous: 'ALO2', result: 'ALO1' },
      user: 'system',
    })
    await expect(readAuditTrail(`${eventId}:${earned.id}`)).resolves.toEqual([])

    // A second run finds nothing more to do.
    await runMigrationLambda(constructPartialAPIGwEvent({}))
    await expect(readAuditTrail(`${eventId}:${lowered.id}`)).resolves.toHaveLength(1)
  })
})
