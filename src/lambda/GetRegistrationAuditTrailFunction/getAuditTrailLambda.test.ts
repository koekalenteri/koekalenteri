import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockAuditTrail = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  auditTrail: mockAuditTrail,
}))

const { getAuditTrailLambda } = await import('./handler')

describe('getAuditTrailLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123', id: 'reg456' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await getAuditTrailLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
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

    mockAuthorize.mockResolvedValueOnce(user)
    mockAuditTrail.mockResolvedValueOnce(auditTrailData)

    const result = await getAuditTrailLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockAuditTrail).toHaveBeenCalledWith(`${eventId}:${regId}`)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(auditTrailData)
  })

  it('returns empty array if no audit trail found', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const emptyAuditTrail: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockAuditTrail.mockResolvedValueOnce(emptyAuditTrail)

    const result = await getAuditTrailLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockAuditTrail).toHaveBeenCalledWith(`${eventId}:${regId}`)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(emptyAuditTrail)
  })

  it('handles missing eventId or id parameters', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = ''
    const regId = ''
    const emptyAuditTrail: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockAuditTrail.mockResolvedValueOnce(emptyAuditTrail)

    const eventWithoutParams = {
      ...event,
      pathParameters: {},
    }

    const result = await getAuditTrailLambda(eventWithoutParams)

    expect(mockAuthorize).toHaveBeenCalledWith(eventWithoutParams)
    expect(mockAuditTrail).toHaveBeenCalledWith(`${eventId}:${regId}`)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(emptyAuditTrail)
  })

  it('handles errors from auditTrail', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const emptyAuditTrail: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)

    // Simulate an error in auditTrail that's caught and returns an empty array
    const error = new Error('Database error')
    console.error = jest.fn()
    mockAuditTrail.mockImplementationOnce(async () => {
      console.error(error)
      return emptyAuditTrail
    })

    const result = await getAuditTrailLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockAuditTrail).toHaveBeenCalledWith(`${eventId}:${regId}`)
    expect(console.error).toHaveBeenCalledWith(error)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(emptyAuditTrail)
  })
})
