import { describe, expect, it } from '@jest/globals'
import { removeRegistrationCreationMetadata } from './registrationMetadata'

describe('removeRegistrationCreationMetadata', () => {
  it('removes the retry credential and every new-registration workflow field', () => {
    const registration = {
      creationIdempotencyKey: 'create-secret',
      newRegistrationAuditAt: '2026-01-01T00:00:00.000Z',
      newRegistrationEmailSentAt: '2026-01-01T00:00:00.000Z',
      newRegistrationLease: { expiresAt: 1, token: 'lease' },
      newRegistrationProcessedAt: '2026-01-01T00:00:00.000Z',
      newRegistrationPublishedAt: '2026-01-01T00:00:00.000Z',
      newRegistrationStatsAt: '2026-01-01T00:00:00.000Z',
      notes: 'keep this',
    }

    expect(removeRegistrationCreationMetadata(registration)).toEqual({ notes: 'keep this' })
  })
})
