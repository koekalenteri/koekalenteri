import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { eventWithStaticDates } from '../../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../../__mockData__/registrations'
import { APIError } from '../../../../api/http'
import * as registrationApi from '../../../../api/registration'
import { idTokenAtom } from '../../../recoil'
import { adminEventsAtom } from '../events'
import { useAdminRegistrationActions } from './actions'
import { adminEventRegistrationsAtom } from './atoms'
import { adminEventRegistrationsSelector } from './selectors'

const mockEnqueueSnackbar = jest.fn()

jest.mock('notistack', () => ({
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
}))

jest.mock('../../../../api/registration')

jest.mock('./effects', () => ({
  adminRemoteRegistrationsEffect: () => () => undefined,
}))

jest.mock('../events/effects', () => ({
  adminRemoteEventsEffect: () => undefined,
}))

function wrapper({ children }: { readonly children: React.ReactNode }) {
  return (
    <RecoilRoot
      initializeState={({ set }) => {
        set(idTokenAtom, 'id-token')
        set(adminEventsAtom, [eventWithStaticDates])
        set(adminEventRegistrationsAtom(eventWithStaticDates.id), [registrationWithStaticDates])
      }}
    >
      <SnackbarProvider>{children}</SnackbarProvider>
    </RecoilRoot>
  )
}

describe('useAdminRegistrationActions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('handles save conflicts and leaves registration state unchanged', async () => {
    jest.spyOn(registrationApi, 'putAdminRegistration').mockRejectedValueOnce(
      new APIError(new Response(null, { status: 409, statusText: 'Conflict' }), {
        email: 'owner@example.com',
        error: 'emailSuppressed',
        reason: 'smtp; 550 user unknown',
      })
    )

    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventWithStaticDates.id),
        registrations: useRecoilValue(adminEventRegistrationsSelector(eventWithStaticDates.id)),
      }),
      { wrapper }
    )

    let saved: Awaited<ReturnType<typeof result.current.actions.save>>
    await act(async () => {
      saved = await result.current.actions.save({ ...registrationWithStaticDates, notes: 'changed notes' })
    })

    expect(saved!).toBeUndefined()
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      expect.stringContaining('registration.notifications.emailSuppressed'),
      {
        persist: true,
        variant: 'error',
      }
    )
    expect(result.current.registrations).toEqual([registrationWithStaticDates])
  })

  it('sends only locally edited registration fields when given a form patch', async () => {
    jest.spyOn(registrationApi, 'putAdminRegistration').mockResolvedValueOnce({
      ...registrationWithStaticDates,
      notes: 'changed notes',
    })
    const { result } = renderHook(() => useAdminRegistrationActions(eventWithStaticDates.id), { wrapper })

    await act(async () => {
      await result.current.save(registrationWithStaticDates, {
        modifiedAt: registrationWithStaticDates.modifiedAt,
        notes: 'changed notes',
      })
    })

    expect(registrationApi.putAdminRegistration).toHaveBeenCalledWith(
      {
        eventId: registrationWithStaticDates.eventId,
        id: registrationWithStaticDates.id,
        modifiedAt: registrationWithStaticDates.modifiedAt,
        notes: 'changed notes',
      },
      'id-token'
    )
  })
})
