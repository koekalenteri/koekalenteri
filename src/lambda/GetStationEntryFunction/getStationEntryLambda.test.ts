import type { APIGatewayProxyEvent } from 'aws-lambda'
import { vi } from 'vitest'
import { getStationEntryToken } from '../lib/stationEntry'
import { asJsonConfirmedEvent, asJsonRegistration, constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockGetEvent = vi.fn()
const mockGetRegistrationsByEventId = vi.fn()

vi.doMock('../lib/lambda', () => ({
  getParam: mockGetParam,
  LambdaError: class LambdaError extends Error {
    constructor(
      public statusCode: number,
      message: string
    ) {
      super(message)
    }
  },
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/event', () => ({ getEvent: mockGetEvent }))
vi.doMock('../lib/registration', () => ({ getRegistrationsByEventId: mockGetRegistrationsByEventId }))

const { default: getStationEntryLambda } = await import('./handler')

const station = { date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 as const }

const confirmedEvent = asJsonConfirmedEvent({
  classes: [{ class: 'AVO' }],
  endDate: '2026-09-12',
  eventType: 'NOWT',
  id: 'event-1',
  location: 'Ranua',
  name: 'Syyskoe',
  organizer: { id: 'org-1', name: 'Org' },
  startDate: '2026-09-12',
  stations: [station],
})

const apiEvent = async (token?: string): Promise<APIGatewayProxyEvent> => {
  const bearer = token ?? (await getStationEntryToken('event-1', station))
  return constructPartialAPIGwEvent({ headers: { authorization: `Bearer ${bearer}` } })
}

describe('getStationEntryLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : 'post-1'))
    mockGetEvent.mockResolvedValue(confirmedEvent)
    mockGetRegistrationsByEventId.mockResolvedValue([
      asJsonRegistration({
        class: 'AVO',
        dog: { name: 'Rekku', regNo: 'REG-1' },
        eventId: 'event-1',
        eventType: 'NOWT',
        group: { date: '2026-09-12', key: 'AVO-AP', number: 1, time: 'ap' },
        handler: { email: 'h@example.com', name: 'Handler' },
        id: 'reg-1',
      }),
    ])
  })

  it('serves the station view for the right token', async () => {
    await getStationEntryLambda(await apiEvent())

    const [status, payload] = mockResponse.mock.calls[0]
    expect(status).toBe(200)
    expect(payload.station).toMatchObject({ id: 'post-1', number: 1 })
    expect(payload.event).toMatchObject({ eventType: 'NOWT', location: 'Ranua', name: 'Syyskoe' })
    expect(payload.registrations[0]).toMatchObject({ dog: { name: 'Rekku' }, id: 'reg-1' })
    expect(JSON.stringify(payload)).not.toContain('example.com')
  })

  it('refuses a wrong token without reading the registrations', async () => {
    await expect(getStationEntryLambda(await apiEvent('wrong'))).rejects.toThrow('not found')

    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
  })
})
