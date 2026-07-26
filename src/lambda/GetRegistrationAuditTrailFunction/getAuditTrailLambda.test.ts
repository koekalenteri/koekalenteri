import { jest } from '@jest/globals'

const mockAuthorizeWithMemberOf = jest.fn<any>()
const mockGetParam = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuditTrail = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
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

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  auditTrail: mockAuditTrail,
}))

const { default: getAuditTrailLambda } = await import('./handler')

describe('getAuditTrailLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123', id: 'reg456' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org1'],
      user: { id: 'user1', name: 'Test User' },
    })
    mockGetEvent.mockResolvedValue({ organizer: { id: 'org1' } })
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res: { body: 'Unauthorized', statusCode: 401 } })

    await getAuditTrailLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).not.toHaveBeenCalled()
    expect(mockAuditTrail).not.toHaveBeenCalled()
  })

  it('rejects users outside the event organizer before reading the audit trail', async () => {
    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org2' } })

    await expect(getAuditTrailLambda(event)).rejects.toMatchObject({ message: 'Forbidden', statusCode: 403 })

    expect(mockAuditTrail).not.toHaveBeenCalled()
  })

  it('returns audit trail if authorized', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const auditTrailData = [
      { action: 'create', auditKey: 'event123:reg456', timestamp: '2025-01-01T00:00:00.000Z' },
      { action: 'update', auditKey: 'event123:reg456', timestamp: '2025-01-02T00:00:00.000Z' },
    ]

    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockAuditTrail.mockResolvedValueOnce(auditTrailData)

    await getAuditTrailLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
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

    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockAuditTrail.mockResolvedValueOnce(emptyAuditTrail)

    await getAuditTrailLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
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

    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockAuditTrail.mockResolvedValueOnce(emptyAuditTrail)

    await getAuditTrailLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
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

    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)

    // Simulate an error in auditTrail that's caught and returns an empty array
    const error = new Error('Database error')
    console.error = jest.fn()
    mockAuditTrail.mockImplementationOnce(async () => {
      console.error(error)
      return emptyAuditTrail
    })

    await getAuditTrailLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockAuditTrail).toHaveBeenCalledWith(`${eventId}:${regId}`)
    expect(console.error).toHaveBeenCalledWith(error)
    expect(mockResponse).toHaveBeenCalledWith(200, emptyAuditTrail, event)
  })
})
