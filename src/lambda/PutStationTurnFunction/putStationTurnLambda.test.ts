import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonConfirmedEvent, JsonStationTurn } from '../../types'
import { vi } from 'vitest'
import { asJsonConfirmedEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetAuthorizedEvent = vi.fn()
const mockGetRegistrationsByEventId = vi.fn()
const mockParseStationTurnOp = vi.fn()
const mockWriteStationTurn = vi.fn()
const mockPublishEventPatch = vi.fn()

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
vi.doMock('../lib/registration', () => ({ getRegistrationsByEventId: mockGetRegistrationsByEventId }))
vi.doMock('../lib/stationTurns', () => ({
  parseStationTurnOp: mockParseStationTurnOp,
  writeStationTurn: mockWriteStationTurn,
}))
vi.doMock('../lib/ws/actions', () => ({ publishEventPatch: mockPublishEventPatch }))

const { default: putStationTurnLambda } = await import('./handler')

const confirmedEvent = (overrides: Partial<JsonConfirmedEvent> = {}) =>
  asJsonConfirmedEvent({
    id: 'event-1',
    organizer: { id: 'org-1', name: 'Org' },
    stations: [{ date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 }],
    ...overrides,
  })

const storedTurn: JsonStationTurn = {
  dogs: [],
  id: 'turn-1',
  pause: 'coffee',
  registrationIds: [],
  startedAt: '2026-09-12T08:00:00.000Z',
  stationId: 'post-1',
}

const apiEvent = (body: unknown): APIGatewayProxyEvent => {
  const partial: Pick<APIGatewayProxyEvent, 'body'> = { body: JSON.stringify(body) }
  // Safe: the handler and every mocked collaborator touch only the body.
  return partial as APIGatewayProxyEvent
}

describe('putStationTurnLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockReturnValue('event-1')
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-1'], user: { name: 'Test User' } })
    mockGetAuthorizedEvent.mockResolvedValue(confirmedEvent())
    mockGetRegistrationsByEventId.mockResolvedValue([])
    mockParseStationTurnOp.mockReturnValue({ pause: 'coffee', type: 'break' })
    mockWriteStationTurn.mockResolvedValue([storedTurn])
  })

  it('writes the op to the named post and broadcasts the new timeline', async () => {
    await putStationTurnLambda(apiEvent({ pause: 'coffee', stationId: 'post-1', type: 'break' }))

    expect(mockWriteStationTurn).toHaveBeenCalledWith(confirmedEvent(), [], 'post-1', {
      pause: 'coffee',
      type: 'break',
    })
    expect(mockPublishEventPatch).toHaveBeenCalledWith({ eventId: 'event-1', turns: [storedTurn] }, 'org-1')
    expect(mockResponse).toHaveBeenCalledWith(200, { turns: [storedTurn] }, expect.anything())
  })

  it('runs the implicit single post for a format without stations', async () => {
    mockGetAuthorizedEvent.mockResolvedValue(confirmedEvent({ stations: undefined }))

    await putStationTurnLambda(apiEvent({ pause: 'coffee', type: 'break' }))

    expect(mockWriteStationTurn).toHaveBeenCalledWith(expect.anything(), [], '1', expect.anything())
  })

  it('refuses a post the event does not have', async () => {
    await expect(putStationTurnLambda(apiEvent({ stationId: 'ghost', type: 'end' }))).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(mockWriteStationTurn).not.toHaveBeenCalled()
  })

  it('returns the auth refusal untouched', async () => {
    const res = { statusCode: 401 }
    mockAuthorizeWithMemberOf.mockResolvedValue({ res })

    expect(await putStationTurnLambda(apiEvent({ type: 'end' }))).toBe(res)
    expect(mockWriteStationTurn).not.toHaveBeenCalled()
  })
})
