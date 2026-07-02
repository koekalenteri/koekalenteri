import type { APIGatewayProxyEvent } from 'aws-lambda'
import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

const mockAuditTrail = jest.fn<any>()
const mockEventAuditKey = jest.fn<any>()
const mockAuthorizeWithMemberOf = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockLambdaError = jest.fn<any>()
const mockResponse = jest.fn<any>()

jest.unstable_mockModule('../lib/audit', () => ({
  auditTrail: mockAuditTrail,
  eventAuditKey: mockEventAuditKey,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  getParam: jest.fn((event: APIGatewayProxyEvent, param: string) => event.pathParameters?.[param]),
  LambdaError: mockLambdaError,
  lambda: jest.fn((_name, handler) => handler),
  response: mockResponse,
}))

const { default: getEventAuditTrailLambda } = await import('./handler')

describe('getEventAuditTrailLambda', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEventAuditKey.mockImplementation((event: { id: string }) => `event:${event.id}`)
    mockLambdaError.mockImplementation((code: number, message: string) => {
      const error = new Error(message) as Error & { statusCode: number }
      error.statusCode = code
      return error
    })
  })

  it('returns 401 if authorization fails', async () => {
    const res = { body: 'Unauthorized', statusCode: 401 }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res })

    await getEventAuditTrailLambda(constructAPIGwEvent('test'))

    expect(mockResponse).not.toHaveBeenCalled()
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockAuditTrail).not.toHaveBeenCalled()
  })

  it('returns audit trail for admin user', async () => {
    const auditTrailData = [
      {
        auditKey: 'event:event-id',
        message: 'Tapahtuma luotu',
        timestamp: '2025-03-22T10:45:33.000Z',
        user: 'Test User',
      },
    ]
    const event = constructAPIGwEvent('test', { pathParameters: { id: 'event-id' } })

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: [], user: { admin: true, name: 'Test User' } })
    mockGetEvent.mockResolvedValueOnce({ id: 'event-id', organizer: { id: 'org-id' } })
    mockAuditTrail.mockResolvedValueOnce(auditTrailData)

    await getEventAuditTrailLambda(event)

    expect(mockEventAuditKey).toHaveBeenCalledWith({ id: 'event-id' })
    expect(mockAuditTrail).toHaveBeenCalledWith('event:event-id')
    expect(mockResponse).toHaveBeenCalledWith(200, auditTrailData, event)
  })

  it('returns audit trail for organizer member', async () => {
    const event = constructAPIGwEvent('test', { pathParameters: { id: 'event-id' } })

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: ['org-id'], user: { admin: false, name: 'Test User' } })
    mockGetEvent.mockResolvedValueOnce({ id: 'event-id', organizer: { id: 'org-id' } })
    mockAuditTrail.mockResolvedValueOnce([])

    await getEventAuditTrailLambda(event)

    expect(mockAuditTrail).toHaveBeenCalledWith('event:event-id')
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('throws 403 for non-member user', async () => {
    const event = constructAPIGwEvent('test', { pathParameters: { id: 'event-id' } })

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: ['other-org-id'],
      user: { admin: false, name: 'Test User' },
    })
    mockGetEvent.mockResolvedValueOnce({ id: 'event-id', organizer: { id: 'org-id' } })

    await expect(getEventAuditTrailLambda(event)).rejects.toEqual(
      expect.objectContaining({ message: 'Forbidden', statusCode: 403 })
    )

    expect(mockAuditTrail).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
