import type { TFunction } from 'i18next'
import type { Registration } from '../../../types'
import { APIError } from '../../../api/http'
import { showRegistrationSaveConflict } from './registrationSaveError'

const registration = {
  dog: {
    name: 'Test Dog',
    regNo: 'FI12345/24',
  },
} as Registration

const t = jest.fn()
const translate = t as unknown as TFunction
const enqueueSnackbar = jest.fn()

const conflict = (body: Record<string, unknown>) =>
  new APIError(new Response(null, { status: 409, statusText: 'Conflict' }), body)

describe('showRegistrationSaveConflict', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    t.mockImplementation((key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options)}`)
  })

  it('shows a persistent error for suppressed email addresses', () => {
    const handled = showRegistrationSaveConflict(
      conflict({ email: 'handler@example.com', error: 'emailSuppressed', reason: 'smtp; 550 user unknown' }),
      { enqueueSnackbar, event: {}, registration, t: translate }
    )

    expect(handled).toBe(true)
    expect(t).toHaveBeenCalledWith('registration.notifications.emailSuppressed', {
      email: 'handler@example.com',
      reason: 'smtp; 550 user unknown',
    })
    expect(enqueueSnackbar).toHaveBeenCalledWith(expect.stringContaining('emailSuppressed'), {
      persist: true,
      variant: 'error',
    })
  })

  it('shows a duplicate registration message for other conflict responses', () => {
    const handled = showRegistrationSaveConflict(conflict({ cancelled: true }), {
      enqueueSnackbar,
      event: {
        contactInfo: {
          secretary: {
            email: 'secretary@example.com',
            name: 'Secretary',
            phone: '050 123',
          },
        },
      },
      registration,
      t: translate,
    })

    expect(handled).toBe(true)
    expect(t).toHaveBeenCalledWith('registration.notifications.alreadyRegistered', {
      contact: 'Secretary, 050 123, secretary@example.com',
      context: 'cancel',
      reg: registration,
    })
    expect(enqueueSnackbar).toHaveBeenCalledWith(expect.stringContaining('alreadyRegistered'), {
      persist: true,
      variant: 'info',
    })
  })

  it('returns false for non-conflict errors', () => {
    const handled = showRegistrationSaveConflict(new Error('boom'), {
      enqueueSnackbar,
      event: {},
      registration,
      t: translate,
    })

    expect(handled).toBe(false)
    expect(enqueueSnackbar).not.toHaveBeenCalled()
  })
})
