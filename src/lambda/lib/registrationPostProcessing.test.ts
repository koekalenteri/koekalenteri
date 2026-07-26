import type { JsonRegistration } from '../../types'
import { jest } from '@jest/globals'

const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<any>()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    read: mockRead,
    update: mockUpdate,
  })),
}))

const { claimNewRegistrationPostProcessing, markNewRegistrationPhase } = await import('./registrationPostProcessing')

describe('registrationPostProcessing', () => {
  const registration = { eventId: 'event-1', id: 'registration-1' } as JsonRegistration

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('claims an expired or absent lease and reads the registration consistently', async () => {
    mockUpdate.mockResolvedValueOnce(undefined)
    mockRead.mockResolvedValueOnce(registration)

    const claim = await claimNewRegistrationPostProcessing('event-1', 'registration-1')

    expect(claim).toBeDefined()
    expect(mockUpdate).toHaveBeenNthCalledWith(
      1,
      { eventId: 'event-1', id: 'registration-1' },
      { set: { newRegistrationLease: { expiresAt: Date.now() + 90_000, token: claim?.token } } },
      expect.anything(),
      undefined,
      {
        expression:
          'attribute_exists(#id) AND (attribute_not_exists(#newRegistrationLease) OR #newRegistrationLease.#expiresAt < :now)',
        names: { '#expiresAt': 'expiresAt', '#id': 'id', '#newRegistrationLease': 'newRegistrationLease' },
        values: { ':now': Date.now() },
      }
    )
    expect(mockRead).toHaveBeenCalledWith({ eventId: 'event-1', id: 'registration-1' }, expect.anything(), true)
    expect(claim?.registration).toBe(registration)
  })

  it('returns undefined when another worker owns the lease', async () => {
    mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })

    await expect(claimNewRegistrationPostProcessing('event-1', 'registration-1')).resolves.toBeUndefined()
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('releases only its own lease and ignores a lease that was taken over', async () => {
    mockUpdate.mockResolvedValueOnce(undefined)
    mockRead.mockResolvedValueOnce(registration)
    const claim = await claimNewRegistrationPostProcessing('event-1', 'registration-1')
    mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })

    await expect(claim?.release()).resolves.toBeUndefined()

    expect(mockUpdate).toHaveBeenLastCalledWith(
      { eventId: 'event-1', id: 'registration-1' },
      { remove: ['newRegistrationLease'] },
      expect.anything(),
      undefined,
      {
        expression: '#newRegistrationLease.#token = :token',
        names: { '#newRegistrationLease': 'newRegistrationLease', '#token': 'token' },
        values: { ':token': claim?.token },
      }
    )
  })

  it('marks a phase only while the caller owns the lease', async () => {
    mockUpdate.mockResolvedValueOnce(undefined)

    await markNewRegistrationPhase('event-1', 'registration-1', 'lease-token', 'newRegistrationEmailSentAt')

    expect(mockUpdate).toHaveBeenCalledWith(
      { eventId: 'event-1', id: 'registration-1' },
      { set: { newRegistrationEmailSentAt: '2026-07-27T12:00:00.000Z' } },
      expect.anything(),
      undefined,
      {
        expression: '#newRegistrationLease.#token = :token',
        names: { '#newRegistrationLease': 'newRegistrationLease', '#token': 'token' },
        values: { ':token': 'lease-token' },
      }
    )
  })
})
