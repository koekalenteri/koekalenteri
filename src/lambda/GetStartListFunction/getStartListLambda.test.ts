import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockGetParam = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetEvent = vi.fn()
const mockQuery = vi.fn()

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

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      query: mockQuery,
    }
  }),
}))

const { default: getStartListLambda } = await import('./handler')

describe('getStartListLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123' },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org123'],
      user: { id: 'user123', roles: { org123: 'secretary' } },
    })
  })

  it('withholds numbers and orders the class alphabetically until they are published', async () => {
    const confirmedEvent = {
      classes: [{ class: 'ALO', state: 'invited' }],
      id: 'event123',
      organizer: { id: 'org123' },
      startDate: '2025-01-01',
      startListPublished: { ALO: true },
      startNumbersPublished: { ALO: false },
      state: 'invited',
    }
    const base = {
      cancelled: false,
      class: 'ALO',
      eventId: 'event123',
      handler: { name: 'Handler' },
      owner: { name: 'Owner' },
    }

    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockQuery.mockResolvedValueOnce([
      { ...base, dog: { name: 'Vieno', regNo: 'REG1' }, group: { date: '2025-01-01', key: 'ALO', number: 1 } },
      { ...base, dog: { name: 'Aapo', regNo: 'REG2' }, group: { date: '2025-01-01', key: 'ALO', number: 2 } },
    ])

    await getStartListLambda(event)

    const [status, payload] = mockResponse.mock.calls[0]
    expect(status).toBe(200)
    // The dogs are real but the order is not: a number that still moves must not look like a
    // promise, so the rows run by name and carry no number at all.
    expect(payload.map((reg: { dog: { name: string } }) => reg.dog.name)).toEqual(['Aapo', 'Vieno'])
    expect(payload[0].group.number).toBeUndefined()
    expect(payload[1].group.number).toBeUndefined()
  })

  it('keeps the numbers of an event that never chose to withhold them', async () => {
    const confirmedEvent = {
      classes: [{ class: 'ALO', state: 'invited' }],
      id: 'event123',
      organizer: { id: 'org123' },
      startDate: '2025-01-01',
      startListPublished: { ALO: true },
      state: 'invited',
    }
    const base = {
      cancelled: false,
      class: 'ALO',
      eventId: 'event123',
      handler: { name: 'Handler' },
      owner: { name: 'Owner' },
    }

    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockQuery.mockResolvedValueOnce([
      { ...base, dog: { name: 'Vieno', regNo: 'REG1' }, group: { date: '2025-01-01', key: 'ALO', number: 1 } },
      { ...base, dog: { name: 'Aapo', regNo: 'REG2' }, group: { date: '2025-01-01', key: 'ALO', number: 2 } },
    ])

    await getStartListLambda(event)

    const [, payload] = mockResponse.mock.calls[0]
    // An absent flag is the legacy "published with the list" default; the order stays numeric.
    expect(payload.map((reg: { group: { number?: number } }) => reg.group.number)).toEqual([1, 2])
  })

  it('serves the frozen number and keeps a cancelled dog as a bare POISSA row', async () => {
    const confirmedEvent = {
      classes: [{ class: 'ALO', state: 'invited' }],
      id: 'event123',
      organizer: { id: 'org123' },
      startDate: '2025-01-01',
      startListPublished: { ALO: true },
      startNumbersPublished: { ALO: true },
      state: 'invited',
    }
    const base = {
      cancelled: false,
      class: 'ALO',
      eventId: 'event123',
      handler: { name: 'Handler' },
      owner: { name: 'Owner' },
    }

    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockQuery.mockResolvedValueOnce([
      {
        ...base,
        dog: { name: 'Vieno', regNo: 'REG1' },
        // The working order has moved since the freeze; the public list must not follow it.
        group: { date: '2025-01-01', key: 'ALO-AP', number: 1, time: 'ap' },
        startGroup: { date: '2025-01-01', key: 'ALO-AP', number: 2, time: 'ap' },
      },
      {
        ...base,
        cancelled: true,
        dog: { name: 'Salainen', regNo: 'REG9' },
        // Cancellation dropped the date from the working group; the frozen placement still knows it.
        group: { key: 'cancelled', number: 1 },
        startGroup: { date: '2025-01-01', key: 'ALO-AP', number: 1, time: 'ap' },
      },
    ])

    await getStartListLambda(event)

    const [status, payload] = mockResponse.mock.calls[0]
    expect(status).toBe(200)
    expect(payload).toHaveLength(2)

    // The cancelled dog holds its number so nobody slides into it, but publishes nothing else.
    expect(payload[0]).toEqual({
      breeder: '',
      cancelled: true,
      class: 'ALO',
      dog: { name: '', regNo: '' },
      group: { date: '2025-01-01', key: 'ALO-AP', number: 1, time: 'ap' },
      handler: '',
      owner: '',
    })
    expect(JSON.stringify(payload[0])).not.toContain('Salainen')

    expect(payload[1].dog.name).toBe('Vieno')
    expect(payload[1].group.number).toBe(2)
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
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      [
        {
          breeder: undefined,
          class: 'ALO',
          dog: { name: 'Dog 1', regNo: 'REG1' },
          group: { date: '2025-01-01', key: 'ALO', number: 1 },
          handler: 'Handler 1',
          numberProvisional: true,
          owner: 'Owner 1',
          ownerHandles: undefined,
        },
      ],
      previewEvent
    )
  })

  it('shows the entered number in the preview and flags a working-order one as provisional', async () => {
    const previewEvent = { ...event, resource: '/admin/startlist/{eventId}' }
    const confirmedEvent = {
      classes: [{ class: 'ALO', state: 'confirmed' }],
      id: 'event123',
      organizer: { id: 'org123' },
      startListPublished: { ALO: true },
      startNumbersPublished: { ALO: false },
      state: 'confirmed',
    }
    const base = {
      cancelled: false,
      class: 'ALO',
      eventId: 'event123',
      handler: { name: 'Handler' },
      owner: { name: 'Owner' },
    }

    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockQuery.mockResolvedValueOnce([
      {
        ...base,
        dog: { name: 'Drawn', regNo: 'REG1' },
        // The secretary entered 2 for this dog; the preview must show it back (KOE-1218), not the
        // working order the row still holds.
        group: { date: '2025-01-01', key: 'ALO-AP', number: 3, time: 'ap' },
        startGroup: { date: '2025-01-01', key: 'ALO-AP', number: 2, time: 'ap' },
      },
      {
        ...base,
        dog: { name: 'Undrawn', regNo: 'REG2' },
        group: { date: '2025-01-01', key: 'ALO-AP', number: 2, time: 'ap' },
      },
    ])

    await getStartListLambda(previewEvent)

    const [status, payload] = mockResponse.mock.calls[0]
    expect(status).toBe(200)
    // Both dogs read 2, but only one owns it: the entered number sorts and renders as the dog's own,
    // the working-order duplicate stays provisional for the preview to grey out and flag.
    expect(payload.map((reg: { dog: { name: string } }) => reg.dog.name)).toEqual(['Drawn', 'Undrawn'])
    expect(payload[0].group.number).toBe(2)
    expect(payload[0].numberProvisional).toBe(false)
    expect(payload[1].group.number).toBe(2)
    expect(payload[1].numberProvisional).toBe(true)
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

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
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
        // The client mirrors the handling owner into `handler`.
        handler: { name: 'Owner 1' },
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
        handler: 'Owner 1',
        owner: 'Owner 1',
        ownerHandles: true,
      },
    ]

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockQuery.mockResolvedValueOnce(registrations)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, expectedPublicRegs, event)
  })

  it('lists every owner and only collapses owner & handler for a single owner', async () => {
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
      // Co-owners: both are listed, and the handling one is named separately.
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
    mockQuery.mockResolvedValueOnce(registrations)

    await getStartListLambda(event)

    expect(mockResponse.mock.calls[0][1].map((r: any) => [r.owner, r.ownerHandles, r.handler])).toEqual([
      ['', true, ''],
      ['Owner 2', true, 'Owner 2'],
      ['Owner 3, Co-owner 3', false, 'Co-owner 3'],
      ['Owner 4', false, ''],
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
    mockQuery.mockResolvedValueOnce(registrations)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
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
    mockQuery.mockResolvedValueOnce(undefined)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
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
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('passes through errors from query', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }
    const error = new Error('Database error')

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockQuery.mockRejectedValueOnce(error)

    await expect(getStartListLambda(event)).rejects.toThrow(error)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('publishes a result only for a class whose results are published', async () => {
    const eventId = 'event123'
    const confirmedEvent = {
      classes: [
        { class: 'ALO', state: 'ended' },
        { class: 'AVO', state: 'ended' },
      ],
      id: eventId,
      resultsPublished: { ALO: true },
      startDate: '2025-01-01',
      startListPublished: true,
      state: 'ended',
    }
    const reg = (eventClass: string, number: number) => ({
      cancelled: false,
      class: eventClass,
      dog: { name: `Dog ${number}`, regNo: `REG${number}` },
      eventId,
      eventResult: { result: `${eventClass}1`, updatedAt: 'x', updatedBy: 'y' },
      group: { date: '2025-01-01', key: eventClass, number },
      handler: { name: 'Handler' },
      owner: { name: 'Owner' },
    })

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockQuery.mockResolvedValueOnce([reg('ALO', 1), reg('AVO', 2)])

    await getStartListLambda(event)

    const [, published] = mockResponse.mock.calls[0]

    // Both dogs are on a published start list, but only one class released its results. The gates are
    // independent, and this is the shape a leak would take.
    expect(published).toHaveLength(2)
    expect(published[0]).toMatchObject({ class: 'ALO', result: 'ALO1' })
    expect(published[1].result).toBeUndefined()
  })
})
