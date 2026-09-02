import type { JsonConfirmedEvent } from '../../types'
import { vi } from 'vitest'
import { getStationEntryToken } from '../lib/stationEntry'
import { asJsonConfirmedEvent, constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetAuthorizedEvent = vi.fn()

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

vi.doMock('../lib/auth', () => ({ authorizeWithMemberOf: mockAuthorizeWithMemberOf }))
vi.doMock('../lib/eventAuth', () => ({ getAuthorizedEvent: mockGetAuthorizedEvent }))

const { default: getStationLinkLambda } = await import('./handler')

const station = { date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 as const, tokenVersion: 3 }

const confirmedEvent = (overrides: Partial<JsonConfirmedEvent> = {}) =>
  asJsonConfirmedEvent({
    eventType: 'NOWT',
    id: 'event-1',
    organizer: { id: 'org-1', name: 'Org' },
    startDate: '2026-09-12',
    stations: [station],
    ...overrides,
  })

const apiEvent = constructPartialAPIGwEvent({})

describe('getStationLinkLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : 'post-1'))
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-1'], user: { name: 'Test User' } })
    mockGetAuthorizedEvent.mockResolvedValue(confirmedEvent())
  })

  it("mints the post's current token, so a revoked link is not the one handed out", async () => {
    await getStationLinkLambda(apiEvent)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      { token: await getStationEntryToken('event-1', station) },
      expect.anything()
    )
  })

  it('mints a token for the implicit post of a single-post format', async () => {
    mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : '1'))
    mockGetAuthorizedEvent.mockResolvedValue(confirmedEvent({ eventType: 'NOME-B', stations: undefined }))

    await getStationLinkLambda(apiEvent)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      { token: await getStationEntryToken('event-1', { id: '1' }) },
      expect.anything()
    )
  })

  it('refuses a post the event does not have', async () => {
    mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : 'ghost'))

    await expect(getStationLinkLambda(apiEvent)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('returns the auth refusal untouched', async () => {
    const res = { statusCode: 401 }
    mockAuthorizeWithMemberOf.mockResolvedValue({ res })

    expect(await getStationLinkLambda(apiEvent)).toBe(res)
    expect(mockGetAuthorizedEvent).not.toHaveBeenCalled()
  })
})
