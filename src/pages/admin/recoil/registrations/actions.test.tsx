import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { eventWithStaticDates } from '../../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../../__mockData__/registrations'
import { APIError } from '../../../../api/http'
import * as registrationApi from '../../../../api/registration'
import { TEST_ID_TOKEN } from '../../../../test-utils/utils'
import { idTokenAtom } from '../../../recoil'
import { adminEventsAtom } from '../events'
import { useAdminRegistrationActions } from './actions'
import {
  adminEventRegistrationsAtom,
  adminEventRegistrationsCursorAtom,
  adminEventRegistrationsFetchedAtAtom,
} from './atoms'
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
        set(idTokenAtom, TEST_ID_TOKEN)
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
      TEST_ID_TOKEN
    )
  })

  it('coalesces stale refreshes and keeps request freshness separate from the server cursor', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-24T12:00:00.000Z'))
    const eventId = eventWithStaticDates.id
    const cursor = new Date('2026-07-24T10:00:00.000Z')
    const fetchedAt = new Date('2026-07-24T11:00:00.000Z')
    const response = { cursor: cursor.getTime(), deletedIds: [], items: [] }
    jest.spyOn(registrationApi, 'getRegistrations').mockResolvedValueOnce(response)

    const staleWrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(idTokenAtom, TEST_ID_TOKEN)
          set(adminEventsAtom, [eventWithStaticDates])
          set(adminEventRegistrationsAtom(eventId), [registrationWithStaticDates])
          set(adminEventRegistrationsCursorAtom(eventId), cursor)
          set(adminEventRegistrationsFetchedAtAtom(eventId), fetchedAt)
        }}
      >
        <SnackbarProvider>{children}</SnackbarProvider>
      </RecoilRoot>
    )

    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventId),
        fetchedAt: useRecoilValue(adminEventRegistrationsFetchedAtAtom(eventId)),
        registrations: useRecoilValue(adminEventRegistrationsAtom(eventId)),
      }),
      { wrapper: staleWrapper }
    )
    const registrationsBeforeRefresh = result.current.registrations

    await act(async () => {
      await Promise.all([result.current.actions.refreshIfStale(), result.current.actions.refreshIfStale()])
    })

    expect(registrationApi.getRegistrations).toHaveBeenCalledTimes(1)
    expect(registrationApi.getRegistrations).toHaveBeenCalledWith(eventId, TEST_ID_TOKEN, undefined, cursor)
    expect(result.current.registrations).toBe(registrationsBeforeRefresh)
    expect(result.current.fetchedAt).toEqual(new Date('2026-07-24T12:00:00.000Z'))

    await act(async () => {
      await result.current.actions.refreshIfStale()
    })
    expect(registrationApi.getRegistrations).toHaveBeenCalledTimes(1)

    jest.useRealTimers()
  })
})
