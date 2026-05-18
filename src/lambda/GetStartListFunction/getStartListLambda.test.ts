import { jest } from '@jest/globals'

const mockGetConfirmedEvent = jest.fn<any>()
const mockGetRegistrationsByEventId = jest.fn<any>()
const mockIsStartListAvailable = jest.fn<any>()

jest.unstable_mockModule('../registration/api', () => ({
  eventReadPort: {
    getConfirmedEvent: mockGetConfirmedEvent,
  },
}))

jest.unstable_mockModule('../../lib/event', () => ({
  isStartListAvailable: mockIsStartListAvailable,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  getRegistrationsByEventId: mockGetRegistrationsByEventId,
}))

const { getStartListLambda } = await import('./handler')

describe('getStartListLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 404 if start list is not available', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: false, state: 'draft' }

    mockGetConfirmedEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(false)

    const result = await getStartListLambda(event)

    expect(mockGetConfirmedEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
    expect(result.statusCode).toBe(404)
    expect(JSON.parse(result.body)).toEqual([])
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

    mockGetConfirmedEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockGetRegistrationsByEventId.mockResolvedValueOnce(registrations)

    const result = await getStartListLambda(event)

    expect(mockGetConfirmedEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(expectedPublicRegs)
  })

  it('returns 404 if no registrations match the criteria', async () => {
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

    mockGetConfirmedEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockGetRegistrationsByEventId.mockResolvedValueOnce(registrations)

    const result = await getStartListLambda(event)

    expect(mockGetConfirmedEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
    expect(result.statusCode).toBe(404)
    expect(JSON.parse(result.body)).toEqual([])
  })

  it('returns 404 if query returns undefined', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }

    mockGetConfirmedEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockGetRegistrationsByEventId.mockResolvedValueOnce(undefined)

    const result = await getStartListLambda(event)

    expect(mockGetConfirmedEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
    expect(result.statusCode).toBe(404)
    expect(JSON.parse(result.body)).toEqual([])
  })

  it('passes through errors from eventReadPort.getConfirmedEvent', async () => {
    const eventId = 'event123'
    const error = new Error('Event not found')

    mockGetConfirmedEvent.mockRejectedValueOnce(error)

    await expect(getStartListLambda(event)).rejects.toThrow(error)

    expect(mockGetConfirmedEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).not.toHaveBeenCalled()
    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
  })

  it('passes through errors from getRegistrationsByEventId', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }
    const error = new Error('Database error')

    mockGetConfirmedEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockGetRegistrationsByEventId.mockRejectedValueOnce(error)

    await expect(getStartListLambda(event)).rejects.toThrow(error)

    expect(mockGetConfirmedEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
  })
})
