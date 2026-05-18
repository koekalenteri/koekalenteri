import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockGetConfirmedEvent = jest.fn<any>()
const mockSaveEvent = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockNanoid = jest.fn<any>()
const mockGetRegistrationsByEventId = jest.fn<any>()
const mockSaveRegistration = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))
jest.unstable_mockModule('../registration/api', () => ({
  eventReadPort: {
    getConfirmedEvent: mockGetConfirmedEvent,
  },
}))
jest.unstable_mockModule('../event/actions', () => ({
  saveEvent: mockSaveEvent,
}))
jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))
jest.unstable_mockModule('nanoid', () => ({
  nanoid: mockNanoid,
}))
jest.unstable_mockModule('../lib/registration', () => ({
  getRegistrationsByEventId: mockGetRegistrationsByEventId,
  saveRegistration: mockSaveRegistration,
}))

const { copyEventLambda } = await import('./handler')

describe('copyEventLambda', () => {
  const event = { body: '{}', headers: {} } as any

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRegistrationsByEventId.mockResolvedValue([])
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)
    const result = await copyEventLambda(event)
    expect(result.statusCode).toBe(401)
    expect(JSON.parse(result.body)).toBe('Unauthorized')
  })

  it('copies event and returns 200 on success', async () => {
    const user = { name: 'Test User' }
    const input = { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' }
    const originalEvent = {
      classes: [{ date: '2025-06-10T00:00:00.000Z' }],
      createdAt: '2025-06-01T00:00:00.000Z',
      createdBy: 'Someone',
      endDate: '2025-06-12T00:00:00.000Z',
      entryEndDate: '2025-06-05T00:00:00.000Z',
      entryOrigEndDate: '2025-06-05T00:00:00.000Z',
      entryStartDate: '2025-06-01T00:00:00.000Z',
      id: 'event123',
      modifiedAt: '2025-06-01T00:00:00.000Z',
      modifiedBy: 'Someone',
      name: 'Original Event',
      startDate: '2025-06-10T00:00:00.000Z',
      state: 'published',
    }
    mockAuthorize.mockResolvedValueOnce(user)
    mockParseJSONWithFallback.mockReturnValueOnce(input)
    mockGetConfirmedEvent.mockResolvedValueOnce({ ...originalEvent })
    mockNanoid.mockReturnValueOnce('newid123')

    const now = new Date('2025-06-02T12:00:00.000Z')
    jest.useFakeTimers().setSystemTime(now)

    const result = await copyEventLambda(event)

    expect(mockSaveEvent).toHaveBeenCalledWith({
      item: expect.objectContaining({
        classes: [
          {
            date: '2025-07-01T00:00:00.000Z',
          },
        ],
        createdAt: now.toISOString(),
        createdBy: user.name,
        endDate: '2025-07-03T00:00:00.000Z',
        entryEndDate: '2025-06-26T00:00:00.000Z',
        entryStartDate: '2025-06-22T00:00:00.000Z',
        id: 'newid123',
        modifiedAt: now.toISOString(),
        modifiedBy: user.name,
        name: 'Kopio - Original Event',
        season: '2025',
        startDate: '2025-07-01T00:00:00.000Z',
        state: 'invited',
      }),
      timestamp: now.toISOString(),
      user,
    })

    expect(result.statusCode).toBe(200)

    jest.useRealTimers()
  })

  it('returns 500 if getEvent throws', async () => {
    const user = { name: 'Test User' }
    mockAuthorize.mockResolvedValueOnce(user)
    mockParseJSONWithFallback.mockReturnValueOnce({ id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockGetConfirmedEvent.mockRejectedValueOnce(new Error('fail'))
    let errorCaught = false
    try {
      await copyEventLambda(event)
    } catch {
      errorCaught = true
    }
    expect(errorCaught).toBe(true)
  })

  it('returns 500 if write throws', async () => {
    const user = { name: 'Test User' }
    const input = { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' }
    const originalEvent = {
      classes: [{ date: '2025-06-10T00:00:00.000Z' }],
      createdAt: '2025-06-01T00:00:00.000Z',
      createdBy: 'Someone',
      endDate: '2025-06-12T00:00:00.000Z',
      entryEndDate: '2025-06-05T00:00:00.000Z',
      entryOrigEndDate: '2025-06-05T00:00:00.000Z',
      entryStartDate: '2025-06-01T00:00:00.000Z',
      id: 'event123',
      modifiedAt: '2025-06-01T00:00:00.000Z',
      modifiedBy: 'Someone',
      name: 'Original Event',
      startDate: '2025-06-10T00:00:00.000Z',
      state: 'published',
    }
    mockAuthorize.mockResolvedValueOnce(user)
    mockParseJSONWithFallback.mockReturnValueOnce(input)
    mockGetConfirmedEvent.mockResolvedValueOnce({ ...originalEvent })
    mockNanoid.mockReturnValueOnce('newid123')
    mockSaveEvent.mockRejectedValueOnce(new Error('fail'))
    let errorCaught = false
    try {
      await copyEventLambda(event)
    } catch {
      errorCaught = true
    }
    expect(errorCaught).toBe(true)
  })
})
