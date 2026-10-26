import type { JsonDogEvent } from '../../types'
import type { CopyImportRequest } from '../lib/eventCopy'
import { vi } from 'vitest'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { legacyEventDay } from '../../lib/storedDays'
import { finnishDayOf } from '../../test-utils/finnishDays'
import { CONFIG } from '../config'
import { createEventCopy } from '../lib/eventCopy'

const mockQueryUsersByEmail = vi.fn()
const mockReadJudges = vi.fn()
const mockReadOrganizers = vi.fn()
const mockSaveEvent = vi.fn()
const mockPublishEventChange = vi.fn()
const mockWriteRegistrations = vi.fn()
const mockUpdateOrganizerEventStats = vi.fn()
const mockAudit = vi.fn()

vi.doMock('../lib/repositories/userRepository', () => ({ queryUsersByEmail: mockQueryUsersByEmail }))
vi.doMock('../lib/repositories/judgeRepository', () => ({ readJudges: mockReadJudges }))
vi.doMock('../lib/repositories/organizerRepository', () => ({ readOrganizers: mockReadOrganizers }))
vi.doMock('../lib/event', () => ({ saveEvent: mockSaveEvent }))
vi.doMock('../lib/ws/actions', () => ({ publishEventChange: mockPublishEventChange }))
vi.doMock('../lib/repositories/registrationRepository', async () => ({
  ...(await vi.importActual<typeof import('../lib/repositories/registrationRepository')>(
    '../lib/repositories/registrationRepository'
  )),
  writeRegistrations: mockWriteRegistrations,
}))
vi.doMock('../lib/stats/stats', async () => ({
  ...(await vi.importActual<typeof import('../lib/stats/stats')>('../lib/stats/stats')),
  updateOrganizerEventStats: mockUpdateOrganizerEventStats,
}))
vi.doMock('../lib/audit', async () => ({
  ...(await vi.importActual<typeof import('../lib/audit')>('../lib/audit')),
  audit: mockAudit,
}))
vi.doMock('nanoid', () => ({ nanoid: () => 'copy-1' }))

const { default: importCopiedEvent } = await import('./handler')

const copier = { email: 'jukka@example.com', name: 'Jukka Kopioija' }

const sourceEvent = (): JsonDogEvent => ({
  ...JSON.parse(JSON.stringify(eventWithParticipantsInvited)),
  judges: [
    { id: 11, name: 'Tuomo Tuomari' },
    { id: 12, name: 'Puuttuva Tuomari' },
  ],
  organizer: { id: 'org-prod', name: 'Seura' },
})

const request = (): CopyImportRequest => ({
  copier,
  copy: createEventCopy(
    { event: sourceEvent(), registrations: jsonRegistrationsToEventWithParticipantsInvited.slice(0, 2) },
    copier
  ).copy,
  organizerKcId: 1234,
  source: { eventId: 'source-1', stage: 'prod' },
})

const judge = { active: true, eventTypes: [eventWithParticipantsInvited.eventType], id: 11, name: 'Tuomo Tuomari' }

describe('importCopiedEvent', () => {
  const { stageName } = CONFIG

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: new Date('2026-09-29T12:00:00.000Z') })
    CONFIG.stageName = 'test'
    mockQueryUsersByEmail.mockResolvedValue([{ admin: true, email: 'jukka@example.com', id: 'u1' }])
    mockReadOrganizers.mockResolvedValue([{ id: 'org-test', kcId: 1234, name: 'Seura' }])
    mockReadJudges.mockResolvedValue([judge])
    mockSaveEvent.mockImplementation(async (event: JsonDogEvent) => ({ audience: 'public', patch: event }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(() => {
    CONFIG.stageName = stageName
  })

  it("stores the copy as a new event of this environment's organizer (KOE-1471)", async () => {
    const result = await importCopiedEvent(request())

    expect(mockSaveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        copiedFrom: { at: '2026-09-29T12:00:00.000Z', by: copier.name, eventId: 'source-1', stage: 'prod' },
        id: 'copy-1',
        name: `[Kopio: prod] ${eventWithParticipantsInvited.name}`,
        organizer: { id: 'org-test', name: 'Seura' },
        organizerId: 'org-test',
        updatedAt: '2026-09-29T12:00:00.000Z',
      })
    )
    expect(mockPublishEventChange).toHaveBeenCalledTimes(1)
    expect(mockQueryUsersByEmail).toHaveBeenCalledWith('jukka@example.com')
    expect(mockWriteRegistrations).toHaveBeenCalledWith([
      expect.objectContaining({ eventId: 'copy-1', updatedAt: '2026-09-29T12:00:00.000Z' }),
      expect.objectContaining({ eventId: 'copy-1', updatedAt: '2026-09-29T12:00:00.000Z' }),
    ])
    expect(mockUpdateOrganizerEventStats).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'copy-1', organizer: { id: 'org-test', name: 'Seura' } }),
      expect.objectContaining({ totalDelta: 2 })
    )
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event:copy-1',
      messageKey: 'audit.messages.eventCopiedFrom',
      messageParams: { eventId: 'source-1', stage: 'prod' },
      user: copier.name,
    })
    expect(result).toEqual({ eventId: 'copy-1', judges: [{ name: 'Puuttuva Tuomari', reason: 'missing' }] })
  })

  // KOE-1547: a copy from an environment not yet migrated holds its days as instants, and this one's
  // migration has run already, so the import stores them as keys itself.
  it('stores the days of a copy that holds them as instants as day keys', async () => {
    const copy = request()

    await importCopiedEvent(copy)

    const startDay = finnishDayOf(eventWithParticipantsInvited.startDate)
    expect(mockSaveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        classes: expect.arrayContaining([expect.objectContaining({ date: startDay })]),
        endDate: finnishDayOf(eventWithParticipantsInvited.endDate),
        season: startDay.slice(0, 4),
        startDate: startDay,
      })
    )
    const [first] = jsonRegistrationsToEventWithParticipantsInvited
    expect(mockWriteRegistrations).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ dates: first.dates.map((date) => ({ ...date, date: legacyEventDay(date.date) })) }),
      ])
    )
  })

  it('does not store a link to a Kennelliitto trial a source that is not up to date still sends (KOE-1534)', async () => {
    const older = request()
    older.copy.event = {
      ...older.copy.event,
      kcEvent: { classes: [], endDate: '2026-09-27', eventType: 'NOU', startDate: '2026-09-26' },
      kcGuid: '2b81e6a1-559b-407c-87c7-b8a9b89b1987',
      kcId: 451859,
    }

    await importCopiedEvent(older)

    expect(mockSaveEvent).toHaveBeenCalledWith(expect.not.objectContaining({ kcEvent: expect.anything() }))
    expect(mockSaveEvent).toHaveBeenCalledWith(expect.not.objectContaining({ kcGuid: expect.anything() }))
    expect(mockSaveEvent).toHaveBeenCalledWith(expect.not.objectContaining({ kcId: expect.anything() }))
  })

  it('does not store the legacy kcId of a copy that has no GUID', async () => {
    const legacy = request()
    legacy.copy.event = { ...legacy.copy.event, kcId: 451859 }

    await importCopiedEvent(legacy)

    expect(mockSaveEvent).toHaveBeenCalledWith(expect.not.objectContaining({ kcId: expect.anything() }))
  })

  it.each([
    ['has no name', undefined],
    ['has an empty name', ''],
    ['has a blank name', '  '],
  ])('names a copy of an event that %s by its prefix only (KOE-1645)', async (_, name) => {
    const nameless = request()
    if (name === undefined) Reflect.deleteProperty(nameless.copy.event, 'name')
    else nameless.copy.event = { ...nameless.copy.event, name }

    await importCopiedEvent(nameless)

    expect(mockSaveEvent).toHaveBeenCalledWith(expect.objectContaining({ name: '[Kopio: prod]' }))
  })

  it('never imports into prod', async () => {
    CONFIG.stageName = 'prod'

    await expect(importCopiedEvent(request())).rejects.toThrow('An event copy is never imported into prod')
    expect(mockSaveEvent).not.toHaveBeenCalled()
  })

  it('checks the copy again, whatever the source says', async () => {
    const tampered = request()
    tampered.copy.registrations[0].handler = { email: 'real@person.fi', membership: false, name: 'X' }

    await expect(importCopiedEvent(tampered)).rejects.toThrow(
      'Event copy rejected: email: an address that is not the copier’s'
    )
    expect(mockSaveEvent).not.toHaveBeenCalled()
  })

  it('needs the copier to be an admin here, where the copy mails them', async () => {
    mockQueryUsersByEmail.mockResolvedValueOnce([
      { email: 'jukka@example.com', id: 'u1', roles: { 'org-test': 'secretary' } },
    ])

    await expect(importCopiedEvent(request())).rejects.toThrow('The copier is not an admin in the target environment')
    expect(mockSaveEvent).not.toHaveBeenCalled()
  })

  it("needs this environment to know the organizer's Kennel Club number", async () => {
    mockReadOrganizers.mockResolvedValueOnce([{ id: 'org-test', kcId: 99, name: 'Toinen seura' }])

    await expect(importCopiedEvent(request())).rejects.toThrow(
      'No organizer with Kennel Club number 1234 in the target environment'
    )
    expect(mockSaveEvent).not.toHaveBeenCalled()
  })

  it('leaves the stats alone for an event without registrations', async () => {
    await importCopiedEvent({ ...request(), copy: { event: request().copy.event, registrations: [] } })

    expect(mockWriteRegistrations).toHaveBeenCalledWith([])
    expect(mockUpdateOrganizerEventStats).not.toHaveBeenCalled()
  })
})
