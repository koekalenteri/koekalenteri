import type { JsonRegistration } from '../../types'
import { shouldClearRegistrationEmailDeliveryStatus } from './emailSuppression'

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
