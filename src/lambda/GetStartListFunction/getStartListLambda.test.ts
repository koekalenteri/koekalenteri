import { vi } from 'vitest'

const mockGetParam = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetEvent = vi.fn()
const mockQuery = vi.fn()
const mockGetStartListPublishedClassMap = vi.fn()
const mockIsStartListAvailable = vi.fn()
const mockIsStartListAvailableForRegistration = vi.fn()
const mockIsStartListPublishedClassMap = vi.fn()

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

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

vi.doMock('../../lib/event', () => ({
  getStartListPublishedClassMap: mockGetStartListPublishedClassMap,
  isEntryClosed: vi.fn(),
  isStartListAvailable: mockIsStartListAvailable,
  isStartListAvailableForRegistration: mockIsStartListAvailableForRegistration,
  isStartListPublishedClassMap: mockIsStartListPublishedClassMap,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      query: mockQuery,
    }
  }),
}))

const { default: getStartListLambda } = await import('./handler')

describe('getStartListLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123' },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org123'],
      user: { id: 'user123', roles: { org123: 'secretary' } },
    })
    mockIsStartListAvailableForRegistration.mockReturnValue(true)
  })

  it('returns unpublished registrations through the authenticated preview route', async () => {
    const previewEvent = { ...event, resource: '/admin/startlist/{eventId}' }
    const confirmedEvent = {
      classes: [{ class: 'ALO', state: 'confirmed' }],
      id: 'event123',
      organizer: { id: 'org123' },
      startListPublished: { ALO: false },
      state: 'confirmed',
    }
    const registration = {
      cancelled: false,
      class: 'ALO',
      dog: { name: 'Dog 1', regNo: 'REG1' },
      eventId: 'event123',
      group: { date: '2025-01-01', key: 'ALO', number: 1 },
      handler: { name: 'Handler 1' },
      owner: { name: 'Owner 1' },
    }

    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockQuery.mockResolvedValueOnce([
      registration,
      {
        ...registration,
        class: 'AVO',
        dog: { name: 'Old class dog', regNo: 'REG2' },
        group: { ...registration.group, number: 2 },
      },
    ])

    await getStartListLambda(previewEvent)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(previewEvent)
    expect(mockIsStartListAvailable).not.toHaveBeenCalled()
    expect(mockIsStartListAvailableForRegistration).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      [
        {
          breeder: undefined,
          class: 'ALO',
          dog: { name: 'Dog 1', regNo: 'REG1' },
          group: { date: '2025-01-01', key: 'ALO', number: 1 },
          handler: 'Handler 1',
          owner: 'Owner 1',
          ownerHandles: undefined,
        },
      ],
      previewEvent
    )
  })

  it('rejects an unauthenticated preview request', async () => {
    const previewEvent = { ...event, resource: '/admin/startlist/{eventId}' }
    const unauthorizedResponse = { statusCode: 401 }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res: unauthorizedResponse })

    await expect(getStartListLambda(previewEvent)).resolves.toBe(unauthorizedResponse)

    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("forbids previewing another organizer's event", async () => {
    const previewEvent = { ...event, resource: '/admin/startlist/{eventId}' }
    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce({ id: 'event123', organizer: { id: 'another-org' } })

    await expect(getStartListLambda(previewEvent)).rejects.toThrow('Forbidden')

    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('returns 404 if start list is not available', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: false, state: 'draft' }

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(false)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockIsStartListAvailableForRegistration).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(404, [], event)
  })

  it('returns 200 with public registrations if start list is available', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }
    const registrations = [
      {
        breeder: { name: 'Breeder 1' },
        cancelled: false,
        class: 'ALO',
        dog: { name: 'Dog 1', regNo: 'REG1' },
        eventId,
        group: { date: '2025-01-01', key: 'ALO', number: 2 },
        handler: { name: 'Handler 1' },
        owner: { name: 'Owner 1' },
        ownerHandles: true,
      },
      {
        breeder: { name: 'Breeder 2' },
        cancelled: false,
        class: 'ALO',
        dog: { name: 'Dog 2', regNo: 'REG2' },
        eventId,
        group: { date: '2025-01-01', key: 'ALO', number: 1 },
        handler: { name: 'Handler 2' },
        owner: { name: 'Owner 2' },
        ownerHandles: false,
      },
      {
        breeder: { name: 'Breeder 3' },
        cancelled: true, // Should be filtered out
        class: 'ALO',
        dog: { name: 'Dog 3', regNo: 'REG3' },
        eventId,
        group: { date: '2025-01-01', key: 'ALO', number: 3 },
        handler: { name: 'Handler 3' },
        owner: { name: 'Owner 3' },
        ownerHandles: false,
      },
      {
        breeder: { name: 'Breeder 4' },
        class: 'ALO',
        dog: { name: 'Dog 4', regNo: 'REG4' },
        eventId,
        handler: { name: 'Handler 4' },
        owner: { name: 'Owner 4' },
        ownerHandles: false,
        // No group, should be filtered out
      },
    ]

    const expectedPublicRegs = [
      {
        breeder: 'Breeder 2',
        class: 'ALO',
        dog: { name: 'Dog 2', regNo: 'REG2' },
        group: { date: '2025-01-01', key: 'ALO', number: 1 },
        handler: 'Handler 2',
        owner: 'Owner 2',
        ownerHandles: false,
      },
      {
        breeder: 'Breeder 1',
        class: 'ALO',
        dog: { name: 'Dog 1', regNo: 'REG1' },
        group: { date: '2025-01-01', key: 'ALO', number: 2 },
        handler: 'Handler 1',
        owner: 'Owner 1',
        ownerHandles: true,
      },
    ]

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockQuery.mockResolvedValueOnce(registrations)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, expectedPublicRegs, event)
  })

  it('publishes ownerHandles for legacy booleans and for a key naming the first owner', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }
    const reg = (number: number, extra: Record<string, unknown>) => ({
      cancelled: false,
      class: 'ALO',
      dog: { name: `Dog ${number}`, regNo: `REG${number}` },
      eventId,
      group: { date: '2025-01-01', key: 'ALO', number },
      ...extra,
    })
    const registrations = [
      // Legacy record: the boolean refers to the single owner on file, even without an owner object.
      reg(1, { ownerHandles: true }),
      reg(2, { ownerHandles: 'owner-1', owners: [{ key: 'owner-1', name: 'Owner 2' }] }),
      // A second owner handles, but the projection only names the first one.
      reg(3, {
        ownerHandles: 'owner-2',
        owners: [
          { key: 'owner-1', name: 'Owner 3' },
          { key: 'owner-2', name: 'Co-owner 3' },
        ],
      }),
      // A key matching no owner publishes false rather than guessing.
      reg(4, { owner: { name: 'Owner 4' }, ownerHandles: 'gone', owners: [{ key: 'owner-1', name: 'Owner 4' }] }),
    ]

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockQuery.mockResolvedValueOnce(registrations)

    await getStartListLambda(event)

    expect(mockResponse.mock.calls[0][1].map((r: any) => [r.owner, r.ownerHandles])).toEqual([
      ['', true],
      ['Owner 2', true],
      ['Owner 3', false],
      ['Owner 4', false],
    ])
  })

  it('filters out registrations from classes where the start list is not published', async () => {
    const eventId = 'event123'
    const confirmedEvent = {
      classes: [{ class: 'ALO', state: 'invited' }],
      id: eventId,
      startListPublished: { ALO: true, AVO: false },
      state: 'invited',
    }
    const registrations = [
      {
        cancelled: false,
        class: 'ALO',
        dog: { name: 'Dog 1', regNo: 'REG1' },
        eventId,
        group: { date: '2025-01-01', key: 'ALO', number: 1 },
        handler: { name: 'Handler 1' },
        owner: { name: 'Owner 1' },
      },
      {
        cancelled: false,
        class: 'AVO',
        dog: { name: 'Dog 2', regNo: 'REG2' },
        eventId,
        group: { date: '2025-01-01', key: 'AVO', number: 2 },
        handler: { name: 'Handler 2' },
        owner: { name: 'Owner 2' },
      },
    ]

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockIsStartListAvailableForRegistration.mockImplementation(
      (_event: unknown, registration: { class: string }) => registration.class === 'ALO'
    )
    mockQuery.mockResolvedValueOnce(registrations)

    await getStartListLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      [
        {
          breeder: undefined,
          class: 'ALO',
          dog: { name: 'Dog 1', regNo: 'REG1' },
          group: { date: '2025-01-01', key: 'ALO', number: 1 },
          handler: 'Handler 1',
          owner: 'Owner 1',
          ownerHandles: undefined,
        },
      ],
      event
    )
  })

  it('returns 200 with an empty list if no registrations match the criteria but the start list is available', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }
    const registrations = [
      {
        breeder: { name: 'Breeder 3' },
        cancelled: true, // Should be filtered out
        class: 'ALO',
        dog: { name: 'Dog 3', regNo: 'REG3' },
        eventId,
        group: { date: '2025-01-01', key: 'ALO', number: 3 },
        handler: { name: 'Handler 3' },
        owner: { name: 'Owner 3' },
        ownerHandles: false,
      },
      {
        breeder: { name: 'Breeder 4' },
        class: 'ALO',
        dog: { name: 'Dog 4', regNo: 'REG4' },
        eventId,
        handler: { name: 'Handler 4' },
        owner: { name: 'Owner 4' },
        ownerHandles: false,
        // No group, should be filtered out
      },
    ]

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockQuery.mockResolvedValueOnce(registrations)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('returns 200 with an empty list if query returns undefined but the start list is available', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockQuery.mockResolvedValueOnce(undefined)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('passes through errors from getEvent', async () => {
    const eventId = 'event123'
    const error = new Error('Event not found')

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockRejectedValueOnce(error)

    await expect(getStartListLambda(event)).rejects.toThrow(error)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('passes through errors from query', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }
    const error = new Error('Database error')

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockQuery.mockRejectedValueOnce(error)

    await expect(getStartListLambda(event)).rejects.toThrow(error)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
