import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { vi } from 'vitest'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockGetAuthorizedEvent = vi.fn()
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

vi.doMock('../lib/auth', () => ({ authorizeWithMemberOf: mockAuthorizeWithMemberOf }))
vi.doMock('../lib/audit', () => ({ audit: mockAudit, registrationAuditKey: mockRegistrationAuditKey }))
vi.doMock('../lib/eventAuth', () => ({ getAuthorizedEvent: mockGetAuthorizedEvent }))
vi.doMock('../lib/registration', () => ({
  getRegistrationsByEventId: mockGetRegistrationsByEventId,
  updateRegistrationField: mockUpdateRegistrationField,
}))
vi.doMock('../lib/ws/actions', () => ({ publishRegistrationPatches: mockPublishRegistrationPatches }))

const { default: putEventResultsLambda } = await import('./handler')

/**
 * The handler reads only `body` off the event; everything else it needs comes through the mocked
 * `getParam`. Narrowing to those fields keeps the fixture honest rather than faking a whole gateway
 * event that nothing looks at.
 */
const apiEvent = (body: unknown): APIGatewayProxyEvent => {
  const partial: Pick<APIGatewayProxyEvent, 'body' | 'headers'> = { body: JSON.stringify(body), headers: {} }

  // Safe: the handler and every mocked collaborator touch only these two fields.
  return partial as APIGatewayProxyEvent
}

const nowtEvent: Pick<JsonConfirmedEvent, 'eventType' | 'organizer' | 'stations' | 'classes'> = {
  classes: [],
  eventType: 'NOWT',
  organizer: { id: 'org-1', name: 'Org' },
  stations: [
    { date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 },
    { date: '2026-09-12', id: 'post-2', number: 2, tasks: 1 },
    { date: '2026-09-12', id: 'post-3', number: 3, tasks: 1 },
    { date: '2026-09-12', id: 'post-4', number: 4, tasks: 1 },
  ],
}

const registration = (id: string, eventClass: JsonRegistration['class'] = 'AVO') =>
  ({ class: eventClass, eventId: 'event-1', id }) as JsonRegistration

const scores = (...points: number[]) =>
  points.map((value, index) => ({ index: 0, points: value, stationId: `post-${index + 1}` }))

describe('putEventResultsLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockReturnValue('event-1')
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-1'], user: { id: 'u1', name: 'Sihteeri' } })
    mockGetAuthorizedEvent.mockResolvedValue(nowtEvent)
    mockGetRegistrationsByEventId.mockResolvedValue([registration('reg-1'), registration('reg-2')])
  })

  const savedResult = () => mockUpdateRegistrationField.mock.calls[0][3]

  it('derives the totals and the result from the submitted scores', async () => {
    await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

    expect(mockUpdateRegistrationField).toHaveBeenCalledTimes(1)
    expect(mockUpdateRegistrationField).toHaveBeenCalledWith('event-1', 'reg-1', 'eventResult', expect.anything())
    expect(savedResult()).toMatchObject({
      maxPoints: 80,
      percentage: 81.25,
      points: 65,
      result: 'AVO1',
      updatedBy: 'Sihteeri',
    })
  })

  it('recomputes a total the client tried to supply', async () => {
    await putEventResultsLambda(
      apiEvent([{ eventResult: { points: 80, result: 'AVO1', tasks: scores(10, 10, 10, 10) }, id: 'reg-1' }])
    )

    // Believing the client here would publish a first prize for a round that earned a third.
    expect(savedResult()).toMatchObject({ points: 40, result: 'AVO3' })
  })

  it('scores a class against its own split of a post', async () => {
    mockGetAuthorizedEvent.mockResolvedValue({
      ...nowtEvent,
      classes: [{ class: 'ALO', date: '2026-09-12', stations: [{ stationId: 'post-1', tasks: 2 }] }],
      stations: [nowtEvent.stations?.[0]],
    })
    mockGetRegistrationsByEventId.mockResolvedValue([registration('reg-1', 'ALO')])

    await putEventResultsLambda(
      apiEvent([
        {
          eventResult: {
            tasks: [
              { index: 0, points: 9, stationId: 'post-1' },
              { index: 1, points: 8, stationId: 'post-1' },
            ],
          },
          id: 'reg-1',
        },
      ])
    )

    expect(savedResult()).toMatchObject({ maxPoints: 20, points: 17 })
  })

  it('broadcasts the batch once rather than dog by dog', async () => {
    await putEventResultsLambda(
      apiEvent([
        { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' },
        { eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-2' },
      ])
    )

    expect(mockUpdateRegistrationField).toHaveBeenCalledTimes(2)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledTimes(1)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event-1',
      [
        { eventResult: expect.objectContaining({ result: 'AVO1' }), id: 'reg-1' },
        { eventResult: expect.objectContaining({ result: 'AVO3' }), id: 'reg-2' },
      ],
      'org-1'
    )
  })

  it('audits each dog whose result was recorded', async () => {
    await putEventResultsLambda(
      apiEvent([
        { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' },
        { eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-2' },
      ])
    )

    expect(mockAudit).toHaveBeenCalledTimes(2)
  })

  it('rejects an empty submission without touching anything', async () => {
    await putEventResultsLambda(apiEvent([]))

    expect(mockResponse).toHaveBeenCalledWith(422, 'no results', expect.anything())
    expect(mockGetAuthorizedEvent).not.toHaveBeenCalled()
    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
  })

  it('refuses a result for a dog that is not in the event', async () => {
    await expect(
      putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(20, 20, 20, 20) }, id: 'stranger' }]))
    ).rejects.toThrow("Registration 'stranger' not found")

    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
  })

  it('stops before writing when the caller has no access to the event', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ res: { statusCode: 401 } })

    await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(20, 20, 20, 20) }, id: 'reg-1' }]))

    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
  })

  describe('retries and conflicts', () => {
    const stored = (updatedAt: string, points: number) => ({
      maxPoints: 80,
      percentage: (points * 100) / 80,
      points,
      result: points >= 64 ? 'AVO1' : 'AVO3',
      tasks: scores(points / 4, points / 4, points / 4, points / 4),
      updatedAt,
      updatedBy: 'Sihteeri',
    })

    it('treats a resubmission of an already stored result as nothing new', async () => {
      // The venue's connection drops, the secretary saves again, and the first attempt had landed.
      mockGetRegistrationsByEventId.mockResolvedValue([
        { ...registration('reg-1'), eventResult: stored('2026-09-12T10:00:00.000Z', 40) },
      ])

      await putEventResultsLambda(
        apiEvent([{ basedOn: undefined, eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-1' }])
      )

      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        { conflicts: [], saved: [], unchanged: ['reg-1'] },
        expect.anything()
      )
    })

    it('reports a conflict when someone else changed the result meanwhile', async () => {
      mockGetRegistrationsByEventId.mockResolvedValue([
        { ...registration('reg-1'), eventResult: stored('2026-09-12T11:00:00.000Z', 80) },
      ])

      await putEventResultsLambda(
        apiEvent([
          // Based on a version that is no longer the stored one, and disagreeing with it.
          { basedOn: '2026-09-12T10:00:00.000Z', eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-1' },
        ])
      )

      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()

      const [status, body] = mockResponse.mock.calls[0]
      expect(status).toBe(409)
      expect(body.error).toBe('resultConflict')
      expect(body.conflicts).toHaveLength(1)
      expect(body.conflicts[0]).toMatchObject({ id: 'reg-1' })
      // Both sides come back so a person can see what they are choosing between.
      expect(body.conflicts[0].stored.points).toBe(80)
      expect(body.conflicts[0].submitted.points).toBe(40)
    })

    it('saves the dogs that do not conflict rather than losing the screenful', async () => {
      mockGetRegistrationsByEventId.mockResolvedValue([
        { ...registration('reg-1'), eventResult: stored('2026-09-12T11:00:00.000Z', 80) },
        registration('reg-2'),
      ])

      await putEventResultsLambda(
        apiEvent([
          { basedOn: '2026-09-12T10:00:00.000Z', eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-1' },
          { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-2' },
        ])
      )

      expect(mockUpdateRegistrationField).toHaveBeenCalledTimes(1)
      expect(mockUpdateRegistrationField).toHaveBeenCalledWith('event-1', 'reg-2', 'eventResult', expect.anything())

      const [, body] = mockResponse.mock.calls[0]
      expect(body.saved).toEqual(['reg-2'])
      expect(body.conflicts.map((c: { id: string }) => c.id)).toEqual(['reg-1'])
    })

    it('accepts an edit made against the version that is actually stored', async () => {
      mockGetRegistrationsByEventId.mockResolvedValue([
        { ...registration('reg-1'), eventResult: stored('2026-09-12T10:00:00.000Z', 40) },
      ])

      await putEventResultsLambda(
        apiEvent([{ basedOn: '2026-09-12T10:00:00.000Z', eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }])
      )

      expect(mockUpdateRegistrationField).toHaveBeenCalledTimes(1)
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        { conflicts: [], saved: ['reg-1'], unchanged: [] },
        expect.anything()
      )
    })
  })

  describe('parallel entry by post', () => {
    const scoredAt = (stationId: string, points: number, updatedAt: string, updatedBy: string) => ({
      index: 0,
      points,
      stationId,
      updatedAt,
      updatedBy,
    })

    const withStored = (...tasks: ReturnType<typeof scoredAt>[]) =>
      mockGetRegistrationsByEventId.mockResolvedValue([
        {
          ...registration('reg-1'),
          eventResult: { tasks, updatedAt: '2026-09-12T10:00:00.000Z', updatedBy: 'Rasti 1' },
        },
      ])

    it("keeps another post's scores when one post saves its own", async () => {
      withStored(scoredAt('post-1', 17, '2026-09-12T10:00:00.000Z', 'Rasti 1'))

      await putEventResultsLambda(
        apiEvent([
          { eventResult: { tasks: [{ index: 0, points: 18, stationId: 'post-3' }] }, id: 'reg-1', stationId: 'post-3' },
        ])
      )

      const stored = mockUpdateRegistrationField.mock.calls[0][3]
      expect(stored.tasks).toEqual([
        expect.objectContaining({ points: 17, stationId: 'post-1' }),
        expect.objectContaining({ points: 18, stationId: 'post-3' }),
      ])
      expect(stored.points).toBe(35)
    })

    it('does not call two posts scoring the same dog a conflict', async () => {
      // Post 3 saved last, so the whole result is newer than anything post 1 ever saw. Versioning the
      // result rather than the post would reject post 1's first save as stale.
      withStored(scoredAt('post-3', 18, '2026-09-12T11:00:00.000Z', 'Rasti 3'))

      await putEventResultsLambda(
        apiEvent([
          { eventResult: { tasks: [{ index: 0, points: 17, stationId: 'post-1' }] }, id: 'reg-1', stationId: 'post-1' },
        ])
      )

      expect(mockUpdateRegistrationField).toHaveBeenCalledTimes(1)
      const [, body] = mockResponse.mock.calls[0]
      expect(body.saved).toEqual(['reg-1'])
      expect(body.conflicts).toEqual([])
    })

    it('reports a conflict only when the same post was rescored by someone else', async () => {
      withStored(scoredAt('post-1', 17, '2026-09-12T11:00:00.000Z', 'Joku muu'))

      await putEventResultsLambda(
        apiEvent([
          {
            basedOn: '2026-09-12T10:00:00.000Z',
            eventResult: { tasks: [{ index: 0, points: 12, stationId: 'post-1' }] },
            id: 'reg-1',
            stationId: 'post-1',
          },
        ])
      )

      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()

      const [status, body] = mockResponse.mock.calls[0]
      expect(status).toBe(409)
      // The post is named, so only that post has to be re-entered.
      expect(body.conflicts[0]).toMatchObject({ id: 'reg-1', stationId: 'post-1' })
    })

    it('treats a post resending what it already stored as nothing new', async () => {
      withStored(scoredAt('post-1', 17, '2026-09-12T10:00:00.000Z', 'Rasti 1'))

      await putEventResultsLambda(
        apiEvent([
          { eventResult: { tasks: [{ index: 0, points: 17, stationId: 'post-1' }] }, id: 'reg-1', stationId: 'post-1' },
        ])
      )

      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      const [, body] = mockResponse.mock.calls[0]
      expect(body.unchanged).toEqual(['reg-1'])
    })

    it("ignores tasks a post submits for somebody else's post", async () => {
      withStored(scoredAt('post-2', 20, '2026-09-12T10:00:00.000Z', 'Rasti 2'))

      await putEventResultsLambda(
        apiEvent([
          {
            eventResult: {
              tasks: [
                { index: 0, points: 17, stationId: 'post-1' },
                { index: 0, points: 1, stationId: 'post-2' },
              ],
            },
            id: 'reg-1',
            stationId: 'post-1',
          },
        ])
      )

      // Post 2 keeps its own 20; the stray task is dropped rather than overwriting it.
      expect(mockUpdateRegistrationField.mock.calls[0][3].tasks).toEqual([
        expect.objectContaining({ points: 20, stationId: 'post-2' }),
        expect.objectContaining({ points: 17, stationId: 'post-1' }),
      ])
    })
  })

  describe('one user entering a whole round, dog by dog', () => {
    const scoredAt = (stationId: string, points: number, updatedAt: string, updatedBy: string) => ({
      index: 0,
      points,
      stationId,
      updatedAt,
      updatedBy,
    })

    it('stores every post in one go', async () => {
      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

      expect(mockUpdateRegistrationField.mock.calls[0][3].tasks).toHaveLength(4)
      expect(mockUpdateRegistrationField.mock.calls[0][3]).toMatchObject({ points: 65, result: 'AVO1' })
    })

    it('builds on what a post already recorded, when working from the current version', async () => {
      mockGetRegistrationsByEventId.mockResolvedValue([
        {
          ...registration('reg-1'),
          eventResult: {
            tasks: [scoredAt('post-1', 17, '2026-09-12T10:00:00.000Z', 'Rasti 1')],
            updatedAt: '2026-09-12T10:00:00.000Z',
            updatedBy: 'Rasti 1',
          },
        },
      ])

      await putEventResultsLambda(
        apiEvent([{ basedOn: '2026-09-12T10:00:00.000Z', eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }])
      )

      expect(mockUpdateRegistrationField.mock.calls[0][3]).toMatchObject({ points: 65, result: 'AVO1' })
    })

    it('will not silently overwrite a post it never saw', async () => {
      // A stale page believing nothing was stored must not wipe the post someone entered meanwhile.
      mockGetRegistrationsByEventId.mockResolvedValue([
        {
          ...registration('reg-1'),
          eventResult: {
            tasks: [scoredAt('post-1', 17, '2026-09-12T10:00:00.000Z', 'Rasti 1')],
            updatedAt: '2026-09-12T10:00:00.000Z',
            updatedBy: 'Rasti 1',
          },
        },
      ])

      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(1, 1, 1, 1) }, id: 'reg-1' }]))

      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockResponse.mock.calls[0][0]).toBe(409)
    })

    it('mixes with per-post entry on the same dog', async () => {
      // Whole round first, then one post rescored on its own.
      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

      const afterRound = mockUpdateRegistrationField.mock.calls[0][3]
      mockGetRegistrationsByEventId.mockResolvedValue([{ ...registration('reg-1'), eventResult: afterRound }])
      mockUpdateRegistrationField.mockClear()

      await putEventResultsLambda(
        apiEvent([
          {
            basedOn: afterRound.tasks[2].updatedAt,
            eventResult: { tasks: [{ index: 0, points: 20, stationId: 'post-3' }] },
            id: 'reg-1',
            stationId: 'post-3',
          },
        ])
      )

      const afterPost = mockUpdateRegistrationField.mock.calls[0][3]
      expect(afterPost.tasks).toHaveLength(4)
      expect(afterPost.points).toBe(69)
    })
  })
})
