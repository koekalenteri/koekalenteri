import type { APIGatewayProxyEvent } from 'aws-lambda'
import { vi } from 'vitest'
import { getStartNumberLinkToken } from '../lib/startNumberLink'
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

const { default: getClassStartNumbersLambda } = await import('./handler')

const confirmedEvent = asJsonConfirmedEvent({
  classes: [{ class: 'ALO' }, { class: 'AVO' }],
  endDate: '2026-09-12',
  eventType: 'NOWT',
  id: 'event-1',
  location: 'Ranua',
  name: 'Syyskoe',
  organizer: { id: 'org-1', name: 'Org' },
  startDate: '2026-09-12',
})

const dog = (id: string, eventClass: 'ALO' | 'AVO', number: number) =>
  asJsonRegistration({
    class: eventClass,
    dog: { name: `Koira ${number}`, regNo: `REG-${number}` },
    eventId: 'event-1',
    eventType: 'NOWT',
    group: { date: '2026-09-12', key: `${eventClass}-AP`, number, time: 'ap' },
    handler: { email: 'handler@example.com', name: `Ohjaaja ${number}` },
    id,
  })

const apiEvent = async (token?: string): Promise<APIGatewayProxyEvent> => {
  const bearer = token ?? (await getStartNumberLinkToken('event-1', confirmedEvent, 'ALO'))
  return constructPartialAPIGwEvent({ headers: { authorization: `Bearer ${bearer}` } })
}

describe('getClassStartNumbersLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : 'ALO'))
    mockGetEvent.mockResolvedValue(confirmedEvent)
    mockGetRegistrationsByEventId.mockResolvedValue([dog('alo-1', 'ALO', 1), dog('avo-1', 'AVO', 2)])
  })

  it('serves the class sheet for the right token, and only that class', async () => {
    await getClassStartNumbersLambda(await apiEvent())

    const [status, payload] = mockResponse.mock.calls[0]
    expect(status).toBe(200)
    expect(payload.eventClass).toBe('ALO')
    expect(payload.event).toMatchObject({ eventType: 'NOWT', location: 'Ranua', name: 'Syyskoe' })
    expect(payload.registrations.map((item: { id: string }) => item.id)).toEqual(['alo-1'])
    // The draw needs the handler's name; nothing behind the sheet rides along with it.
    expect(JSON.stringify(payload)).not.toContain('example.com')
  })

  it('refuses a wrong token without reading the registrations', async () => {
    await expect(getClassStartNumbersLambda(await apiEvent('wrong'))).rejects.toThrow('not found')

    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
  })
})
