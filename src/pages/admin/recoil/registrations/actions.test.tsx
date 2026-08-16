import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot, useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
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
  adminPendingRegistrationGroupMovesAtom,
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

const queuedRegistration = { ...registrationWithStaticDates, class: 'AVO' as const, id: 'queued-registration' }
const groupResponse = {
  cancelledFailed: [],
  cancelledOk: [],
  classes: eventWithStaticDates.classes,
  entries: eventWithStaticDates.entries,
  invitedFailed: [],
  invitedOk: [],
  items: [registrationWithStaticDates, queuedRegistration],
  pickedFailed: [],
  pickedOk: [],
  reserveFailed: [],
  reserveOk: [],
} as Awaited<ReturnType<typeof registrationApi.putRegistrationGroups>>

function groupQueueWrapper({ children }: { readonly children: React.ReactNode }) {
  return (
    <RecoilRoot
      initializeState={({ set }) => {
        set(idTokenAtom, TEST_ID_TOKEN)
        set(adminEventsAtom, [eventWithStaticDates])
        set(adminEventRegistrationsAtom(eventWithStaticDates.id), [registrationWithStaticDates, queuedRegistration])
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
    jest.spyOn(registrationApi, 'postAdminRegistration').mockRejectedValueOnce(
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

  it('sends only locally edited registration fields as patch operations', async () => {
    jest.spyOn(registrationApi, 'patchAdminRegistration').mockResolvedValueOnce({
      ...registrationWithStaticDates,
      notes: 'changed notes',
    })
    const { result } = renderHook(() => useAdminRegistrationActions(eventWithStaticDates.id), { wrapper })

    await act(async () => {
      await result.current.save({ ...registrationWithStaticDates, notes: 'changed notes' }, registrationWithStaticDates)
    })

    expect(registrationApi.patchAdminRegistration).toHaveBeenCalledWith(
      {
        eventId: registrationWithStaticDates.eventId,
        id: registrationWithStaticDates.id,
        modifiedAt: registrationWithStaticDates.modifiedAt,
        operations: [{ path: ['notes'], type: 'CHANGE', value: 'changed notes' }],
      },
      TEST_ID_TOKEN
    )
  })

  it('does not store pending group placement when updating an unrelated field', () => {
    const eventId = eventWithStaticDates.id
    const { result } = renderHook(
      () => ({
        base: useRecoilValue(adminEventRegistrationsAtom(eventId)),
        registrations: useRecoilValue(adminEventRegistrationsSelector(eventId)),
        setPendingMoves: useSetRecoilState(adminPendingRegistrationGroupMovesAtom(eventId)),
        setRegistrations: useRecoilState(adminEventRegistrationsSelector(eventId))[1],
      }),
      { wrapper }
    )

    act(() => {
      result.current.setPendingMoves([
        { cancelReason: 'test', group: { key: 'cancelled' }, id: registrationWithStaticDates.id },
      ])
    })
    expect(result.current.registrations[0]).toMatchObject({ cancelled: true, group: { key: 'cancelled' } })

    act(() => {
      result.current.setRegistrations([{ ...result.current.registrations[0], internalNotes: 'updated' }])
    })

    expect(result.current.base[0]).toMatchObject({ internalNotes: 'updated' })
    expect(result.current.base[0].group).toBeUndefined()
    expect(result.current.base[0].cancelled).toBeUndefined()
    expect(result.current.registrations[0]).toMatchObject({ cancelled: true, group: { key: 'cancelled' } })
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

  it('queues group moves by the latest registration classes', async () => {
    let resolveFirst!: (response: Awaited<ReturnType<typeof registrationApi.putRegistrationGroups>>) => void
    const firstResponse = new Promise<Awaited<ReturnType<typeof registrationApi.putRegistrationGroups>>>((resolve) => {
      resolveFirst = resolve
    })
    const putGroups = jest
      .spyOn(registrationApi, 'putRegistrationGroups')
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(groupResponse)

    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventWithStaticDates.id),
        registrations: useRecoilValue(adminEventRegistrationsSelector(eventWithStaticDates.id)),
      }),
      { wrapper: groupQueueWrapper }
    )
    const firstMove = { group: { key: 'reserve' }, id: registrationWithStaticDates.id }
    const queuedMove = { group: { key: 'reserve' }, id: queuedRegistration.id }

    let firstRequest!: Promise<false | undefined>
    let queuedRequest!: Promise<false | undefined>
    await act(async () => {
      firstRequest = result.current.actions.saveGroups(eventWithStaticDates.id, [firstMove])
      await Promise.resolve()
      queuedRequest = result.current.actions.saveGroups(eventWithStaticDates.id, [queuedMove])
      expect(putGroups).toHaveBeenCalledTimes(1)
      resolveFirst(groupResponse)
      await firstRequest
      await queuedRequest
    })

    expect(putGroups).toHaveBeenCalledTimes(2)
    expect(putGroups).toHaveBeenNthCalledWith(2, expect.any(String), [queuedMove], expect.anything())
  })

  it('refreshes authoritative registrations after a group move failure', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(registrationApi, 'putRegistrationGroups').mockRejectedValueOnce(new Error('network failure'))
    const refresh = jest.spyOn(registrationApi, 'getRegistrations').mockResolvedValueOnce([queuedRegistration] as never)
    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventWithStaticDates.id),
        registrations: useRecoilValue(adminEventRegistrationsSelector(eventWithStaticDates.id)),
      }),
      { wrapper: groupQueueWrapper }
    )

    let saved: false | undefined
    await act(async () => {
      saved = await result.current.actions.saveGroups(eventWithStaticDates.id, [
        { group: { key: 'reserve' }, id: registrationWithStaticDates.id },
      ])
    })

    expect(saved).toBe(false)
    expect(refresh).toHaveBeenCalledWith(eventWithStaticDates.id, TEST_ID_TOKEN)
    expect(result.current.registrations).toEqual([queuedRegistration])
    consoleError.mockRestore()
  })
})
