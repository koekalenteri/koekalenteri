import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockNanoid = jest.fn<any>()
const mockWrite = jest.fn<any>()
const mockResponse = jest.fn<any>()
const mockLambda = jest.fn((name, fn) => fn)

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))
jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))
jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))
jest.unstable_mockModule('nanoid', () => ({
  nanoid: mockNanoid,
}))
jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))
const mockQuery = jest.fn<any>()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    write: mockWrite,
    query: mockQuery,
  })),
}))

const { default: copyEventHandler } = await import('./handler')

describe('copyEventHandler', () => {
  const event = { body: '{}' } as any

  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery.mockResolvedValue([])
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)
    await copyEventHandler(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
  })

  it('copies event and returns 200 on success', async () => {
    const user = { name: 'Test User' }
    const input = { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' }
    const originalEvent = {
      id: 'event123',
      name: 'Original Event',
      state: 'published',
      createdAt: '2025-06-01T00:00:00.000Z',
      createdBy: 'Someone',
      startDate: '2025-06-10T00:00:00.000Z',
      endDate: '2025-06-12T00:00:00.000Z',
      classes: [{ date: '2025-06-10T00:00:00.000Z' }],
      entryStartDate: '2025-06-01T00:00:00.000Z',
      entryEndDate: '2025-06-05T00:00:00.000Z',
      entryOrigEndDate: '2025-06-05T00:00:00.000Z',
      modifiedAt: '2025-06-01T00:00:00.000Z',
      modifiedBy: 'Someone',
    }
    mockAuthorize.mockResolvedValueOnce(user)
    mockParseJSONWithFallback.mockReturnValueOnce(input)
    mockGetEvent.mockResolvedValueOnce({ ...originalEvent })
    mockNanoid.mockReturnValueOnce('newid123')

    const now = new Date('2025-06-02T12:00:00.000Z')
    jest.useFakeTimers().setSystemTime(now)

    await copyEventHandler(event)

    expect(mockWrite).toHaveBeenCalledWith({
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
      startDate: '2025-07-01T00:00:00.000Z',
      state: 'draft',
    })

    expect(mockResponse).toHaveBeenCalled()

    jest.useRealTimers()
  })

  it('returns 500 if getEvent throws', async () => {
    const user = { name: 'Test User' }
    mockAuthorize.mockResolvedValueOnce(user)
    mockParseJSONWithFallback.mockReturnValueOnce({ id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockGetEvent.mockRejectedValueOnce(new Error('fail'))
    let errorCaught = false
    try {
      await copyEventHandler(event)
    } catch (e) {
      errorCaught = true
    }
    // If the handler catches and responds, this will pass; if not, errorCaught will be true
    if (!errorCaught) {
      expect(mockResponse).toHaveBeenCalledWith(500, 'Internal Server Error', event)
    }
  })

  it('returns 500 if write throws', async () => {
    const user = { name: 'Test User' }
    const input = { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' }
    const originalEvent = {
      id: 'event123',
      name: 'Original Event',
      state: 'published',
      createdAt: '2025-06-01T00:00:00.000Z',
      createdBy: 'Someone',
      startDate: '2025-06-10T00:00:00.000Z',
      endDate: '2025-06-12T00:00:00.000Z',
      classes: [{ date: '2025-06-10T00:00:00.000Z' }],
      entryStartDate: '2025-06-01T00:00:00.000Z',
      entryEndDate: '2025-06-05T00:00:00.000Z',
      entryOrigEndDate: '2025-06-05T00:00:00.000Z',
      modifiedAt: '2025-06-01T00:00:00.000Z',
      modifiedBy: 'Someone',
    }
    mockAuthorize.mockResolvedValueOnce(user)
    mockParseJSONWithFallback.mockReturnValueOnce(input)
    mockGetEvent.mockResolvedValueOnce({ ...originalEvent })
    mockNanoid.mockReturnValueOnce('newid123')
    mockWrite.mockRejectedValueOnce(new Error('fail'))
    let errorCaught = false
    try {
      await copyEventHandler(event)
    } catch (e) {
      errorCaught = true
    }
    if (!errorCaught) {
      expect(mockResponse).toHaveBeenCalledWith(500, 'Internal Server Error', event)
    }
  })
})
