import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { APIError } from '../../../api/http'
import * as registrationApi from '../../../api/registration'
import { useRegistrationActions } from './actions'

const mockEnqueueSnackbar = jest.fn()

jest.mock('notistack', () => ({
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
}))

jest.mock('../../../api/registration')

function wrapper({ children }: { readonly children: React.ReactNode }) {
  return (
    <RecoilRoot>
      <SnackbarProvider>{children}</SnackbarProvider>
    </RecoilRoot>
  )
}

describe('useRegistrationActions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('handles save conflicts and returns undefined', async () => {
    jest.spyOn(registrationApi, 'putRegistration').mockRejectedValueOnce(
      new APIError(new Response(null, { status: 409, statusText: 'Conflict' }), {
        email: 'owner@example.com',
        error: 'emailSuppressed',
        reason: 'smtp; 550 user unknown',
      })
    )

    const { result } = renderHook(() => useRegistrationActions(), { wrapper })

    let saved: Awaited<ReturnType<typeof result.current.save>>
    await act(async () => {
      saved = await result.current.save(registrationWithStaticDates, eventWithStaticDates)
    })

    expect(saved!).toBeUndefined()
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      expect.stringContaining('registration.notifications.emailSuppressed'),
      {
        persist: true,
        variant: 'error',
      }
    )
  })
})
