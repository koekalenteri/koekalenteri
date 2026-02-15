import { getEvent } from '../api/event'
import { getRegistration, putRegistration } from '../api/registration'
import { deferredLoader } from './RegistrationInvitation'

// Mock dependencies
jest.mock('../api/event', () => ({ getEvent: jest.fn() }))
jest.mock('../api/registration', () => ({ getRegistration: jest.fn(), putRegistration: jest.fn() }))

const mockGetEvent = getEvent as jest.Mock
const mockGetRegistration = getRegistration as jest.Mock
const mockPutRegistration = putRegistration as jest.Mock

describe('RegistrationInvitation deferredLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('throws error when id or registrationId is missing', async () => {
    await expect(deferredLoader(undefined, 'reg123', undefined)).rejects.toThrow('invalid params')
    await expect(deferredLoader('event123', undefined, undefined)).rejects.toThrow('invalid params')
    await expect(deferredLoader(undefined, undefined, undefined)).rejects.toThrow('invalid params')
  })

  it('throws error when event or registration is not found', async () => {
    mockGetEvent.mockResolvedValueOnce(null)
    mockGetRegistration.mockResolvedValueOnce(null)

    await expect(deferredLoader('event123', 'reg123', undefined)).rejects.toThrow('not found')
  })

  it('marks invitation as read if not already read', async () => {
    const mockEvent = { id: 'event123', name: 'Test Event' }
    const mockRegistration = {
      dog: { name: 'Test Dog' },
      eventId: 'event123',
      handler: { name: 'Test Handler' },
      id: 'reg123',
      invitationRead: false,
    }

    mockGetEvent.mockResolvedValueOnce(mockEvent)
    mockGetRegistration.mockResolvedValueOnce(mockRegistration)
    mockPutRegistration.mockResolvedValueOnce(undefined)

    await deferredLoader('event123', 'reg123', undefined)

    expect(mockPutRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reg123',
        invitationRead: true,
      }),
      undefined,
      undefined
    )
  })

  it('does not mark invitation as read if already read', async () => {
    const mockEvent = { id: 'event123', name: 'Test Event' }
    const mockRegistration = {
      dog: { name: 'Test Dog' },
      eventId: 'event123',
      handler: { name: 'Test Handler' },
      id: 'reg123',
      invitationRead: true,
    }

    mockGetEvent.mockResolvedValueOnce(mockEvent)
    mockGetRegistration.mockResolvedValueOnce(mockRegistration)

    await deferredLoader('event123', 'reg123', undefined)

    expect(mockPutRegistration).not.toHaveBeenCalled()
  })

  it('returns URL when invitation attachment exists', async () => {
    const mockEvent = { id: 'event123', name: 'Test Event' }
    const mockRegistration = {
      dates: [{ date: new Date('2021-01-01T12:00Z') }],
      dog: { name: 'Test Dog' },
      eventId: 'event123',
      eventType: 'test-type',
      handler: { name: 'Test Handler' },
      id: 'reg123',
      invitationAttachment: 'attachment-key',
      invitationRead: true,
    }

    mockGetEvent.mockResolvedValueOnce(mockEvent)
    mockGetRegistration.mockResolvedValueOnce(mockRegistration)

    const result = await deferredLoader('event123', 'reg123', undefined)

    expect(result).toEqual({
      event: mockEvent,
      registration: mockRegistration,
      url: '/file/attachment-key/kutsu-test-type-01.01.2021.pdf',
    })
  })

  it('returns only event and registration when no invitation attachment', async () => {
    const mockEvent = { id: 'event123', name: 'Test Event' }
    const mockRegistration = {
      dog: { name: 'Test Dog' },
      eventId: 'event123',
      handler: { name: 'Test Handler' },
      id: 'reg123',
      invitationRead: true,
    }

    mockGetEvent.mockResolvedValueOnce(mockEvent)
    mockGetRegistration.mockResolvedValueOnce(mockRegistration)

    const result = await deferredLoader('event123', 'reg123', undefined)

    expect(result).toEqual({
      event: mockEvent,
      registration: mockRegistration,
    })
  })

  it('handles API errors gracefully', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    mockGetEvent.mockRejectedValueOnce(new Error('API error'))
    mockGetRegistration.mockRejectedValueOnce(new Error('API error'))

    await expect(deferredLoader('event123', 'reg123', undefined)).rejects.toThrow('not found')
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('passes the abort signal to API calls', async () => {
    const mockEvent = { id: 'event123', name: 'Test Event' }
    const mockRegistration = {
      dog: { name: 'Test Dog' },
      eventId: 'event123',
      handler: { name: 'Test Handler' },
      id: 'reg123',
      invitationRead: true,
    }

    mockGetEvent.mockResolvedValueOnce(mockEvent)
    mockGetRegistration.mockResolvedValueOnce(mockRegistration)

    const mockSignal = {} as AbortSignal

    await deferredLoader('event123', 'reg123', mockSignal)

    expect(mockGetEvent).toHaveBeenCalledWith('event123', mockSignal)
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg123', undefined, mockSignal)
  })
})
