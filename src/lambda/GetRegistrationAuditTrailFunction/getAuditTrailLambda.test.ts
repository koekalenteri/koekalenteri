import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockGetParam = jest.fn<any>()
const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuditTrail = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  getParam: mockGetParam,
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  auditTrail: mockAuditTrail,
}))

const { default: getAuditTrailLambda } = await import('./handler')

describe('getAuditTrailLambda', () => {
  const event = {
    headers: {},
    body: '',
    pathParameters: { eventId: 'event123', id: 'reg456' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await getAuditTrailLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockGetParam).not.toHaveBeenCalled()
    expect(mockAuditTrail).not.toHaveBeenCalled()
  })

  it('returns audit trail if authorized', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const auditTrailData = [
      { auditKey: 'event123:reg456', action: 'create', timestamp: '2025-01-01T00:00:00.000Z' },
      { auditKey: 'event123:reg456', action: 'update', timestamp: '2025-01-02T00:00:00.000Z' },
    ]

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockAuditTrail.mockResolvedValueOnce(auditTrailData)

    await getAuditTrailLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockAuditTrail).toHaveBeenCalledWith(`${eventId}:${regId}`)
    expect(mockResponse).toHaveBeenCalledWith(200, auditTrailData, event)
  })

  it('returns empty array if no audit trail found', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const emptyAuditTrail: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockAuditTrail.mockResolvedValueOnce(emptyAuditTrail)

    await getAuditTrailLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockAuditTrail).toHaveBeenCalledWith(`${eventId}:${regId}`)
    expect(mockResponse).toHaveBeenCalledWith(200, emptyAuditTrail, event)
  })

  it('handles missing eventId or id parameters', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = undefined
    const regId = undefined
    const emptyAuditTrail: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockAuditTrail.mockResolvedValueOnce(emptyAuditTrail)

    await getAuditTrailLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockAuditTrail).toHaveBeenCalledWith('undefined:undefined')
    expect(mockResponse).toHaveBeenCalledWith(200, emptyAuditTrail, event)
  })

  it('handles errors from auditTrail', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const emptyAuditTrail: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)

    // Simulate an error in auditTrail that's caught and returns an empty array
    const error = new Error('Database error')
    console.error = jest.fn()
    mockAuditTrail.mockImplementationOnce(async () => {
      console.error(error)
      return emptyAuditTrail
    })

    await getAuditTrailLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockAuditTrail).toHaveBeenCalledWith(`${eventId}:${regId}`)
    expect(console.error).toHaveBeenCalledWith(error)
    expect(mockResponse).toHaveBeenCalledWith(200, emptyAuditTrail, event)
  })
})
