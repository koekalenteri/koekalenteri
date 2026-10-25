import type { JsonDogEvent, JsonRegistration } from '../../../types'
import { vi } from 'vitest'
import { eventWithParticipantsInvited } from '../../../__mockData__/events'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../../__mockData__/registrations'

const mockReadSeasonEvents = vi.fn<(season: number) => Promise<JsonDogEvent[] | undefined>>()
const mockReadEventRegistrations = vi.fn<(eventId: string) => Promise<JsonRegistration[]>>()

vi.doMock('../repositories/eventRepository', () => ({ readSeasonEvents: mockReadSeasonEvents }))
vi.doMock('../repositories/registrationRepository', () => ({ readEventRegistrations: mockReadEventRegistrations }))

const { getEventClassStats } = await import('./eventClassStats')

const jsonEvent = (patch: Partial<JsonDogEvent>): JsonDogEvent => ({
  ...JSON.parse(JSON.stringify(eventWithParticipantsInvited)),
  ...patch,
})

describe('getEventClassStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reads the season's events and counts each held or planned one's registrations", async () => {
    mockReadSeasonEvents.mockResolvedValueOnce([
      jsonEvent({ id: 'held' }),
      jsonEvent({ id: 'tentative', state: 'tentative' }),
    ])
    mockReadEventRegistrations.mockImplementation(async (eventId) =>
      eventId === 'held' ? jsonRegistrationsToEventWithParticipantsInvited : []
    )

    const rows = await getEventClassStats(2024)

    expect(mockReadSeasonEvents).toHaveBeenCalledWith(2024)
    expect(mockReadEventRegistrations).toHaveBeenCalledWith('held')
    expect(mockReadEventRegistrations).toHaveBeenCalledWith('tentative')
    const held = rows.filter((row) => row.state === eventWithParticipantsInvited.state)
    const tentative = rows.filter((row) => row.state === 'tentative')
    expect(held.length).toBeGreaterThan(0)
    expect(held.reduce((total, row) => total + row.entries, 0)).toBe(
      jsonRegistrationsToEventWithParticipantsInvited.filter((registration) => registration.state === 'ready').length
    )
    expect(tentative.map((row) => row.entries)).toEqual(held.map(() => 0))
  })

  it('leaves drafts, cancelled and deleted trials out without reading their registrations', async () => {
    mockReadSeasonEvents.mockResolvedValueOnce([
      jsonEvent({ id: 'draft', state: 'draft' }),
      jsonEvent({ id: 'cancelled', state: 'cancelled' }),
      jsonEvent({ deletedAt: '2024-05-01T10:00:00.000Z', id: 'deleted' }),
    ])

    await expect(getEventClassStats(2024)).resolves.toEqual([])
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it('answers an empty list for a season without events', async () => {
    mockReadSeasonEvents.mockResolvedValueOnce(undefined)

    await expect(getEventClassStats(2019)).resolves.toEqual([])
  })
})
