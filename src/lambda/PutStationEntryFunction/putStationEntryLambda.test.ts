import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { getStationEntryToken } from '../lib/stationEntry'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockGetEvent = vi.fn()
const mockGetRegistrationsByEventId = vi.fn()
const mockUpdateRegistrationField = vi.fn()
const mockPublishRegistrationPatches = vi.fn()

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

vi.doMock('../lib/audit', () => ({ audit: mockAudit, registrationAuditKey: mockRegistrationAuditKey }))
vi.doMock('../lib/event', () => ({ getEvent: mockGetEvent }))
vi.doMock('../lib/registration', () => ({
  getRegistrationsByEventId: mockGetRegistrationsByEventId,
  updateRegistrationField: mockUpdateRegistrationField,
}))
vi.doMock('../lib/ws/actions', () => ({ publishRegistrationPatches: mockPublishRegistrationPatches }))

const { default: putStationEntryLambda } = await import('./handler')

const station = { date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 as const }

const confirmedEvent = {
  classes: [],
  eventType: 'NOWT',
  id: 'event-1',
  organizer: { id: 'org-1', name: 'Org' },
  stations: [station, { date: '2026-09-12', id: 'post-2', number: 2, tasks: 1 as const }],
} as unknown as JsonConfirmedEvent

const registration = (id: string) =>
  ({ class: 'AVO', eventId: 'event-1', group: { key: 'AVO-AP', number: 1 }, id }) as JsonRegistration

const apiEvent = async (body: unknown, token?: string): Promise<APIGatewayProxyEvent> => {
  const bearer = token ?? (await getStationEntryToken('event-1', station))
  const partial: Pick<APIGatewayProxyEvent, 'body' | 'headers'> = {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${bearer}` },
  }

  // Safe: the handler and every mocked collaborator touch only these two fields.
  return partial as APIGatewayProxyEvent
}

describe('putStationEntryLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : 'post-1'))
    mockGetEvent.mockResolvedValue(confirmedEvent)
    mockGetRegistrationsByEventId.mockResolvedValue([registration('reg-1')])
  })

  it('refuses a wrong token before touching anything', async () => {
    await expect(
      putStationEntryLambda(await apiEvent([{ eventResult: { tasks: [] }, id: 'reg-1' }], 'wrong'))
    ).rejects.toThrow('not found')

    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
  })

  it('saves under this post and attributes the write to it, whatever the body claims', async () => {
    await putStationEntryLambda(
      await apiEvent([
        {
          eventResult: {
            tasks: [
              { index: 0, points: 17, stationId: 'post-1' },
              // A task naming another post is dropped by the scoped merge, not written.
              { index: 0, points: 20, stationId: 'post-2' },
            ],
          },
          id: 'reg-1',
          // A claimed scope is overridden by the path: this link is one post's and nothing else's.
          stationId: 'post-2',
        },
      ])
    )

    expect(mockUpdateRegistrationField).toHaveBeenCalledTimes(1)
    const saved = mockUpdateRegistrationField.mock.calls[0][3]
    expect(saved.tasks).toHaveLength(1)
    expect(saved.tasks[0]).toMatchObject({ points: 17, stationId: 'post-1', updatedBy: 'Rasti 1' })

    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ user: 'Rasti 1' }))
  })

  it('echoes back only what the link may see', async () => {
    mockGetRegistrationsByEventId.mockResolvedValue([
      {
        ...registration('reg-1'),
        eventResult: {
          tasks: [{ index: 0, points: 12, stationId: 'post-2', updatedAt: 't2', updatedBy: 'u' }],
          updatedAt: 't2',
          updatedBy: 'u',
        },
      },
    ])

    await putStationEntryLambda(
      await apiEvent([
        {
          basedOn: undefined,
          eventResult: { tasks: [{ index: 0, points: 17, stationId: 'post-1' }] },
          id: 'reg-1',
        },
      ])
    )

    const [status, payload] = mockResponse.mock.calls[0]
    expect(status).toBe(200)
    // The stored round holds another post's score and, once complete, the prize — neither of which is
    // this link's to see.
    expect(payload.saved[0].eventResult.tasks).toHaveLength(1)
    expect(payload.saved[0].eventResult.tasks[0]).toMatchObject({ stationId: 'post-1' })
    expect(payload.saved[0].eventResult).not.toHaveProperty('result')
    expect(payload.saved[0].eventResult).not.toHaveProperty('points')
  })
})
