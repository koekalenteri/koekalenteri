import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonConfirmedEvent, JsonStationTurn } from '../../types'
import { vi } from 'vitest'
import { getStationEntryToken } from '../lib/stationEntry'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockGetEvent = vi.fn()
const mockGetRegistrationsByEventId = vi.fn()
const mockWriteStationTurn = vi.fn()
const mockParseStationTurnOp = vi.fn()
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

vi.doMock('../lib/event', () => ({ getEvent: mockGetEvent }))
vi.doMock('../lib/registration', () => ({ getRegistrationsByEventId: mockGetRegistrationsByEventId }))
vi.doMock('../lib/stationTurns', () => ({
  parseStationTurnOp: mockParseStationTurnOp,
  writeStationTurn: mockWriteStationTurn,
}))
vi.doMock('../lib/ws/actions', () => ({ publishEventPatch: mockPublishEventPatch }))

const { default: putStationEntryTurnLambda } = await import('./handler')

const station = { date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 as const }

const confirmedEvent = {
  classes: [],
  eventType: 'NOWT',
  id: 'event-1',
  organizer: { id: 'org-1', name: 'Org' },
  stations: [station],
} as unknown as JsonConfirmedEvent

const storedTurn: JsonStationTurn = {
  dogs: [{ name: 'Dog', number: 1 }],
  id: 'turn-1',
  registrationIds: ['run-1'],
  startedAt: '2026-09-12T08:00:00.000Z',
  stationId: 'post-1',
}

const apiEvent = async (body: unknown, token?: string): Promise<APIGatewayProxyEvent> => {
  const bearer = token ?? (await getStationEntryToken('event-1', station))
  const partial: Pick<APIGatewayProxyEvent, 'body' | 'headers'> = {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${bearer}` },
  }

  // Safe: the handler and every mocked collaborator touch only these two fields.
  return partial as APIGatewayProxyEvent
}

describe('putStationEntryTurnLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : 'post-1'))
    mockGetEvent.mockResolvedValue(confirmedEvent)
    mockGetRegistrationsByEventId.mockResolvedValue([])
    mockParseStationTurnOp.mockReturnValue({ type: 'end' })
    mockWriteStationTurn.mockResolvedValue([storedTurn])
  })

  it('writes the op onto this post, broadcasts, and echoes the public shape', async () => {
    await putStationEntryTurnLambda(await apiEvent({ type: 'end' }))

    expect(mockParseStationTurnOp).toHaveBeenCalledWith({ type: 'end' })
    expect(mockWriteStationTurn).toHaveBeenCalledWith(confirmedEvent, [], 'post-1', { type: 'end' })
    expect(mockPublishEventPatch).toHaveBeenCalledWith({ eventId: 'event-1', turns: [storedTurn] }, 'org-1')
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        turns: [
          {
            dogs: [{ name: 'Dog', number: 1 }],
            id: 'turn-1',
            startedAt: '2026-09-12T08:00:00.000Z',
            stationId: 'post-1',
          },
        ],
      },
      expect.anything()
    )
  })

  it('echoes only this post: a racing span on another post stays out of the response', async () => {
    mockWriteStationTurn.mockResolvedValue([storedTurn, { ...storedTurn, id: 'turn-2', stationId: 'post-2' }])

    await putStationEntryTurnLambda(await apiEvent({ type: 'end' }))

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      { turns: [expect.objectContaining({ id: 'turn-1' })] },
      expect.anything()
    )
  })

  it('refuses a wrong token with the same 404 as a missing station', async () => {
    await expect(putStationEntryTurnLambda(await apiEvent({ type: 'end' }, 'wrong-token'))).rejects.toMatchObject({
      status: 404,
    })
    expect(mockWriteStationTurn).not.toHaveBeenCalled()
  })
})
