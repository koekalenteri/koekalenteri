import type { JsonDogEvent } from '../../types'
import type { CopyImportRequest } from '../lib/eventCopy'
import { vi } from 'vitest'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { CONFIG } from '../config'
import { createEventCopy } from '../lib/eventCopy'

const mockQuery = vi.fn()
const mockReadAll = vi.fn()
const mockSaveEvent = vi.fn()
const mockPublishEventChange = vi.fn()
const mockSaveRegistrations = vi.fn()
const mockUpdateOrganizerEventStats = vi.fn()
const mockAudit = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { query: mockQuery, readAll: mockReadAll }
  }),
}))
vi.doMock('../lib/event', () => ({ saveEvent: mockSaveEvent }))
vi.doMock('../lib/ws/actions', () => ({ publishEventChange: mockPublishEventChange }))
vi.doMock('../lib/registration', async () => ({
  ...(await vi.importActual<typeof import('../lib/registration')>('../lib/registration')),
  saveRegistrations: mockSaveRegistrations,
}))
vi.doMock('../lib/stats', async () => ({
  ...(await vi.importActual<typeof import('../lib/stats')>('../lib/stats')),
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
    mockQuery.mockResolvedValue([{ admin: true, email: 'jukka@example.com', id: 'u1' }])
    mockReadAll.mockImplementation(async ({ table }: { table: string }) =>
      table === CONFIG.organizerTable ? [{ id: 'org-test', kcId: 1234, name: 'Seura' }] : [judge]
    )
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
    expect(mockSaveRegistrations).toHaveBeenCalledWith([
      expect.objectContaining({ eventId: 'copy-1', updatedAt: '2026-09-29T12:00:00.000Z' }),
      expect.objectContaining({ eventId: 'copy-1', updatedAt: '2026-09-29T12:00:00.000Z' }),
    ])
    expect(mockUpdateOrganizerEventStats).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'copy-1', organizer: { id: 'org-test', name: 'Seura' } }),
      expect.objectContaining({ totalDelta: 2 })
    )
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event:copy-1',
      message: 'Kopioitu ympäristöstä prod (source-1)',
      user: copier.name,
    })
    expect(result).toEqual({ eventId: 'copy-1', judges: [{ name: 'Puuttuva Tuomari', reason: 'missing' }] })
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
    mockQuery.mockResolvedValueOnce([{ email: 'jukka@example.com', id: 'u1', roles: { 'org-test': 'secretary' } }])

    await expect(importCopiedEvent(request())).rejects.toThrow('The copier is not an admin in the target environment')
    expect(mockSaveEvent).not.toHaveBeenCalled()
  })

  it("needs this environment to know the organizer's Kennel Club number", async () => {
    mockReadAll.mockResolvedValueOnce([{ id: 'org-test', kcId: 99, name: 'Toinen seura' }])

    await expect(importCopiedEvent(request())).rejects.toThrow(
      'No organizer with Kennel Club number 1234 in the target environment'
    )
    expect(mockSaveEvent).not.toHaveBeenCalled()
  })

  it('leaves the stats alone for an event without registrations', async () => {
    await importCopiedEvent({ ...request(), copy: { event: request().copy.event, registrations: [] } })

    expect(mockSaveRegistrations).toHaveBeenCalledWith([])
    expect(mockUpdateOrganizerEventStats).not.toHaveBeenCalled()
  })
})
