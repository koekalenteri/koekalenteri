import { describe, expect, it } from '@jest/globals'
import {
  authorizeRegistrationEdit,
  authorizeRegistrationRead,
  deriveRegistrationEditToken,
  participantRegistrationResponse,
  publicRegistrationPatch,
} from './registrationAccess'

describe('registrationAccess', () => {
  const registration = { editTokenVersion: 1, eventId: 'event', id: 'registration' }
  const secret = 'test-registration-edit-token-secret'

  it('authorizes only the matching bearer token', async () => {
    const token = deriveRegistrationEditToken(registration, secret)

    await expect(
      authorizeRegistrationEdit({ headers: { authorization: `Bearer ${token}` } }, registration)
    ).resolves.toBe(token)
    await expect(authorizeRegistrationEdit({ headers: {} }, registration)).rejects.toThrow('404 not found')
    await expect(
      authorizeRegistrationEdit({ headers: { Authorization: 'Bearer another-secret' } }, registration)
    ).rejects.toThrow('404 not found')
  })

  it('allows a tokenless read only for a legacy registration', async () => {
    const legacyRegistration = { eventId: registration.eventId, id: registration.id }
    const expected = deriveRegistrationEditToken(legacyRegistration, secret)

    await expect(authorizeRegistrationRead({ headers: {} }, legacyRegistration)).resolves.toBe(expected)
    await expect(authorizeRegistrationRead({ headers: {} }, registration)).rejects.toThrow('404 not found')
    await expect(
      authorizeRegistrationRead({ headers: { Authorization: 'Bearer invalid' } }, legacyRegistration)
    ).rejects.toThrow('404 not found')
  })

  it('derives one stable token until its version is changed', () => {
    const token = deriveRegistrationEditToken(registration, secret)

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(deriveRegistrationEditToken(registration, secret)).toBe(token)
    expect(deriveRegistrationEditToken({ ...registration, editTokenVersion: 2 }, secret)).not.toBe(token)
  })

  it('drops privileged and workflow metadata from public patches', () => {
    const patch = publicRegistrationPatch(
      {
        eventId: 'event',
        group: { key: 'picked', number: 1 },
        id: 'registration',
        internalNotes: 'secretary note',
        notes: 'participant note',
        paidAmount: 0,
        priorityByInvitation: true,
        qualifies: true,
        qualifyingResults: [],
        refundAmount: 100,
        selectedCost: 'normal',
        state: 'ready',
      },
      true
    )

    expect(patch).toEqual({
      eventId: 'event',
      id: 'registration',
      notes: 'participant note',
      selectedCost: 'normal',
    })
  })

  it('allows only one-way participant workflow transitions', () => {
    expect(
      publicRegistrationPatch(
        { cancelled: false, cancelReason: 'reason', confirmed: false, invitationRead: false },
        true
      )
    ).toEqual({})
    expect(
      publicRegistrationPatch({ cancelled: true, cancelReason: 'reason', confirmed: true, invitationRead: true }, true)
    ).toEqual({ cancelled: true, cancelReason: 'reason', confirmed: true, invitationRead: true })
  })

  it('never returns the stored token version to a participant', () => {
    const stored = { editTokenVersion: 3, id: 'registration' }
    expect(participantRegistrationResponse(stored, 'raw-token')).toEqual({
      editToken: 'raw-token',
      id: 'registration',
    })
  })
})
