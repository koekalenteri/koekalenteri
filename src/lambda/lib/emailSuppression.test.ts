import type { JsonRegistration, RegistrationOwner } from '../../types'
import { vi } from 'vitest'

const mockRead = vi.fn()
vi.doMock('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      read: mockRead,
    }
  }),
}))

const {
  assertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails,
  shouldClearRegistrationEmailDeliveryStatus,
} = await import('./emailSuppression')

const person = (email: string) => ({ email, membership: false, name: 'Test Person' })

const registration = (overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
  ({
    eventId: 'event-id',
    handler: person('handler@example.com'),
    id: 'registration-id',
    owner: person('owner@example.com'),
    payer: person('payer@example.com'),
    ...overrides,
  }) as JsonRegistration

describe('email suppression helpers', () => {
  it('clears delivery status when the failed address is no longer used', () => {
    const existing = registration({
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'owner@example.com',
        status: 'bounce',
      },
    })
    const updated = registration({ owner: person('new-owner@example.com') })

    expect(shouldClearRegistrationEmailDeliveryStatus(existing, updated)).toBe(true)
  })

  it('keeps delivery status when another address changes', () => {
    const existing = registration({
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'owner@example.com',
        status: 'bounce',
      },
    })
    const updated = registration({ handler: person('new-handler@example.com') })

    expect(shouldClearRegistrationEmailDeliveryStatus(existing, updated)).toBe(false)
  })

  it('keeps delivery status when the same failed address is still used in another field', () => {
    const existing = registration({
      emailDeliveryStatus: {
        at: '2026-05-27T10:00:00.000Z',
        email: 'owner@example.com',
        status: 'bounce',
      },
    })
    const updated = registration({
      handler: person('owner@example.com'),
      owner: person('new-owner@example.com'),
    })

    expect(shouldClearRegistrationEmailDeliveryStatus(existing, updated)).toBe(false)
  })
})

describe('normalizeRegistrationEmails', () => {
  const owner = (email: string, key: string): RegistrationOwner => ({ ...person(email), key })

  it('normalizes owner, owners, handler and payer emails', () => {
    const reg = registration({
      handler: person(' Handler@Example.com '),
      owner: person('OWNER@example.com'),
      owners: [owner('OWNER@example.com', 'owner-1'), owner(' Co-Owner@Example.com', 'owner-2')],
      payer: person('Payer@example.com '),
    })

    const result = normalizeRegistrationEmails(reg)

    expect(result).toBe(reg)
    expect(result.handler?.email).toBe('handler@example.com')
    expect(result.owner?.email).toBe('owner@example.com')
    expect(result.owners?.map((o) => o.email)).toEqual(['owner@example.com', 'co-owner@example.com'])
    expect(result.payer?.email).toBe('payer@example.com')
  })

  it('handles a legacy registration without owners', () => {
    const reg = registration({ owner: person('Owner@example.com') })
    delete reg.owners

    expect(normalizeRegistrationEmails(reg).owner?.email).toBe('owner@example.com')
    expect(reg.owners).toBeUndefined()
  })

  it('skips owners without an email', () => {
    const reg = registration({
      owners: [{ key: 'owner-1', membership: false, name: 'No Email' } as RegistrationOwner],
    })

    expect(() => normalizeRegistrationEmails(reg)).not.toThrow()
    expect(reg.owners?.[0]?.email).toBeUndefined()
  })
})

describe('assertRegistrationEmailsNotSuppressed', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockRead.mockResolvedValue(undefined)
  })

  const suppressed = (email: string) => ({
    email,
    eventId: 'event-id',
    reason: 'smtp; 550 user unknown',
    registrationId: 'registration-id',
    status: 'bounce',
    updatedAt: '2026-05-27T10:00:00.000Z',
  })

  it('rejects a new registration using a suppressed address', async () => {
    mockRead.mockImplementation(async ({ email }: { email: string }) =>
      email === 'owner@example.com' ? suppressed(email) : undefined
    )

    await expect(assertRegistrationEmailsNotSuppressed(registration())).rejects.toMatchObject({
      error: JSON.stringify({
        email: 'owner@example.com',
        error: 'emailSuppressed',
        reason: 'smtp; 550 user unknown',
      }),
      status: 409,
    })
  })

  it('rejects an update that introduces a suppressed address', async () => {
    mockRead.mockImplementation(async ({ email }: { email: string }) =>
      email === 'new-handler@example.com' ? suppressed(email) : undefined
    )

    await expect(
      assertRegistrationEmailsNotSuppressed(
        registration({ handler: person('new-handler@example.com') }),
        registration()
      )
    ).rejects.toMatchObject({ status: 409 })
  })

  it('accepts a save that leaves a stored suppressed address untouched (KOE-1381)', async () => {
    mockRead.mockImplementation(async ({ email }: { email: string }) =>
      email === 'co-owner@example.com' ? suppressed(email) : undefined
    )
    const owners = [
      { ...person('owner@example.com'), key: 'owner-1' },
      { ...person('co-owner@example.com'), key: 'owner-2' },
    ]
    const existing = registration({ owners })

    await expect(
      assertRegistrationEmailsNotSuppressed(registration({ confirmed: true, owners }), existing)
    ).resolves.toBeUndefined()
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('accepts fixing one address while another stays suppressed (KOE-1381)', async () => {
    mockRead.mockImplementation(async ({ email }: { email: string }) =>
      email === 'owner@example.com' ? suppressed(email) : undefined
    )
    const existing = registration()

    await expect(
      assertRegistrationEmailsNotSuppressed(registration({ handler: person('new-handler@example.com') }), existing)
    ).resolves.toBeUndefined()
    expect(mockRead).toHaveBeenCalledWith({ email: 'new-handler@example.com' })
  })
})
