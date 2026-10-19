import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '@/__mockData__/events'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { sendTemplatedEmail } from '@/api/email'
import { APIError } from '@/api/http'
import { createRefund } from '@/api/payment'
import * as registrationApi from '@/api/registration'
import { getPaymentPicture } from '@/lib/payment'
import { idTokenAtom } from '@/pages/state'
import { TEST_ID_TOKEN } from '@/test-utils/utils'
import { adminEventAtom, adminEventsAtom } from '../events'
import { useAdminRegistrationActions, useKennelliittoResults } from './actions'
import {
  adminEventRegistrationsAtom,
  adminEventRegistrationsCursorAtom,
  adminEventRegistrationsFetchedAtAtom,
  adminPendingRegistrationGroupMovesAtom,
} from './atoms'
import { adminProjectedEventRegistrationsAtom } from './derivedAtoms'

const mockEnqueueSnackbar = vi.fn()

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
}))

vi.mock('@/api/email')
vi.mock('@/api/payment')
vi.mock('@/api/registration')

function wrapper({ children }: { readonly children: React.ReactNode }) {
  return (
    <Provider
      initializeState={({ set }) => {
        set(idTokenAtom, TEST_ID_TOKEN)
        set(adminEventsAtom, [eventWithStaticDates])
        set(adminEventRegistrationsAtom(eventWithStaticDates.id), [registrationWithStaticDates])
      }}
    >
      {children}
    </Provider>
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
    <Provider
      initializeState={({ set }) => {
        set(idTokenAtom, TEST_ID_TOKEN)
        set(adminEventsAtom, [eventWithStaticDates])
        set(adminEventRegistrationsAtom(eventWithStaticDates.id), [registrationWithStaticDates, queuedRegistration])
      }}
    >
      {children}
    </Provider>
  )
}

describe('useAdminRegistrationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles save conflicts and leaves registration state unchanged', async () => {
    vi.spyOn(registrationApi, 'postAdminRegistration').mockRejectedValueOnce(
      new APIError(new Response(null, { status: 409, statusText: 'Conflict' }), {
        email: 'owner@example.com',
        error: 'emailSuppressed',
        reason: 'smtp; 550 user unknown',
      })
    )

    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventWithStaticDates.id),
        registrations: useAtomValue(adminProjectedEventRegistrationsAtom(eventWithStaticDates.id)),
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
    vi.spyOn(registrationApi, 'patchAdminRegistration').mockResolvedValueOnce({
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

  it('sends no money operations for a save after an optimistic refund (KOE-1531)', async () => {
    vi.mocked(createRefund).mockResolvedValueOnce({ provider: 'nordea', status: 'ok', transactionId: 'refund-1' })
    vi.spyOn(registrationApi, 'patchAdminRegistration').mockResolvedValueOnce({
      ...registrationWithStaticDates,
      notes: 'changed notes',
    })
    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventWithStaticDates.id),
        registrations: useAtomValue(adminEventRegistrationsAtom(eventWithStaticDates.id)),
      }),
      { wrapper }
    )

    await act(async () => {
      await result.current.actions.refund(registrationWithStaticDates, 'payment-1', 1000, 250)
    })
    // The dialog's row follows the list until the first edit, so the edit starts from the refunded row,
    // while the base it is compared with is the row as the dialog opened.
    const refunded = result.current.registrations.find(({ id }) => id === registrationWithStaticDates.id)
    expect(refunded).toMatchObject({ openRefunds: ['refund-1'], refundAmount: 10, refundHandlingCost: 2.5 })

    await act(async () => {
      await result.current.actions.save({ ...refunded!, notes: 'changed notes' }, registrationWithStaticDates)
    })

    expect(registrationApi.patchAdminRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ operations: [{ path: ['notes'], type: 'CHANGE', value: 'changed notes' }] }),
      TEST_ID_TOKEN
    )
  })

  it('sends no operations on fields the server moved after the dialog opened (KOE-1574)', async () => {
    vi.spyOn(registrationApi, 'patchAdminRegistration').mockResolvedValueOnce({
      ...registrationWithStaticDates,
      notes: 'changed notes',
    })
    const { result } = renderHook(() => useAdminRegistrationActions(eventWithStaticDates.id), { wrapper })
    // The dialog's row follows the list until the first edit, so a result sent to Kennelliitto (or a
    // payment) that lands meanwhile reaches the edit, while the base stays the row as the dialog opened.
    const movedByServer = {
      ...registrationWithStaticDates,
      kcResult: { at: new Date('2026-10-19T08:00:00.000Z'), by: 'secretary', status: 'sent' as const },
      updatedAt: new Date('2026-10-19T08:00:00.000Z'),
    }

    await act(async () => {
      await result.current.save({ ...movedByServer, notes: 'changed notes' }, registrationWithStaticDates)
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
        base: useAtomValue(adminEventRegistrationsAtom(eventId)),
        registrations: useAtomValue(adminProjectedEventRegistrationsAtom(eventId)),
        setPendingMoves: useSetAtom(adminPendingRegistrationGroupMovesAtom(eventId)),
        setRegistrations: useAtom(adminProjectedEventRegistrationsAtom(eventId))[1],
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
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T12:00:00.000Z'))
    const eventId = eventWithStaticDates.id
    const cursor = new Date('2026-07-24T10:00:00.000Z')
    const fetchedAt = new Date('2026-07-24T11:00:00.000Z')
    const response = { cursor: cursor.getTime(), deletedIds: [], items: [] }
    vi.spyOn(registrationApi, 'getRegistrations').mockResolvedValueOnce(response)

    const staleWrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <Provider
        initializeState={({ set }) => {
          set(idTokenAtom, TEST_ID_TOKEN)
          set(adminEventsAtom, [eventWithStaticDates])
          set(adminEventRegistrationsAtom(eventId), [registrationWithStaticDates])
          set(adminEventRegistrationsCursorAtom(eventId), cursor)
          set(adminEventRegistrationsFetchedAtAtom(eventId), fetchedAt)
        }}
      >
        {children}
      </Provider>
    )

    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventId),
        fetchedAt: useAtomValue(adminEventRegistrationsFetchedAtAtom(eventId)),
        registrations: useAtomValue(adminEventRegistrationsAtom(eventId)),
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

    vi.useRealTimers()
  })

  it('queues group moves by the latest registration classes', async () => {
    let resolveFirst!: (response: Awaited<ReturnType<typeof registrationApi.putRegistrationGroups>>) => void
    const firstResponse = new Promise<Awaited<ReturnType<typeof registrationApi.putRegistrationGroups>>>((resolve) => {
      resolveFirst = resolve
    })
    const putGroups = vi
      .spyOn(registrationApi, 'putRegistrationGroups')
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(groupResponse)

    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventWithStaticDates.id),
        registrations: useAtomValue(adminProjectedEventRegistrationsAtom(eventWithStaticDates.id)),
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

  it('tells the secretary that a koekutsu waits for the place to be paid', async () => {
    vi.spyOn(registrationApi, 'putRegistrationGroups').mockResolvedValueOnce({
      ...groupResponse,
      invitationAwaitingPayment: ['handler@example.com'],
    })

    const { result } = renderHook(() => useAdminRegistrationActions(eventWithStaticDates.id), {
      wrapper: groupQueueWrapper,
    })

    await act(async () => {
      await result.current.saveGroups(eventWithStaticDates.id, [
        { group: { key: 'ALO-AP' }, id: registrationWithStaticDates.id },
      ])
    })

    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      'registration.notifications.groupMove.invitationAwaitingPayment\n\nhandler@example.com',
      expect.objectContaining({ variant: 'info' })
    )
  })

  it('refreshes authoritative registrations after a group move failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(registrationApi, 'putRegistrationGroups').mockRejectedValueOnce(new Error('network failure'))
    const refresh = vi.spyOn(registrationApi, 'getRegistrations').mockResolvedValueOnce([queuedRegistration] as never)
    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventWithStaticDates.id),
        registrations: useAtomValue(adminProjectedEventRegistrationsAtom(eventWithStaticDates.id)),
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

  it('stores the start list flag the invitations settled, not the copy from before them', async () => {
    // An event from before the flag reads an absent flag as a published list. Sending the invitations
    // settles it to false on the server; the copy stored here has to say so too, or the panel keeps
    // reading the list as public until the next save answers with the truth (KOE-1432).
    const unsettled = { ...eventWithStaticDates, startListPublished: undefined, state: 'picked' as const }
    const settledWrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <Provider
        initializeState={({ set }) => {
          set(idTokenAtom, TEST_ID_TOKEN)
          set(adminEventsAtom, [unsettled])
          set(adminEventRegistrationsAtom(unsettled.id), [registrationWithStaticDates])
        }}
      >
        {children}
      </Provider>
    )
    vi.mocked(sendTemplatedEmail).mockResolvedValueOnce({
      classes: unsettled.classes,
      failed: [],
      ok: [registrationWithStaticDates.id],
      registrations: [registrationWithStaticDates],
      startListPublished: false,
      state: 'invited',
    })

    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(unsettled.id),
        event: useAtomValue(adminEventAtom(unsettled.id)),
      }),
      { wrapper: settledWrapper }
    )

    await act(async () => {
      await result.current.actions.sendMessage({
        contactInfo: undefined,
        eventId: unsettled.id,
        registrationIds: [registrationWithStaticDates.id],
        template: 'invitation',
        text: '',
      })
    })

    expect(result.current.event).toMatchObject({ startListPublished: false, state: 'invited' })
  })

  // KOE-1526 review: the row must read right after the click as it will once the refund is applied.
  // A reserve paid 50 and had 45 back with 5 kept: its fee went back, so nothing is missing.
  // KOE-1529: the server ADDs to openRefunds for every refund it creates, synchronous ones
  // included, but only a synchronous one is also written refundStatus SUCCESS -- a pending or
  // emailed one waits for refundSuccess to actually settle it.
  it.each<[string, { provider: string; status: 'ok' | 'pending'; transactionId: string }, boolean]>([
    ['an email refund', { provider: 'email refund', status: 'ok', transactionId: 'r-1' }, false],
    ['a pending refund', { provider: 'nordea', status: 'pending', transactionId: 'r-1' }, false],
    ['a refund made at once', { provider: 'nordea', status: 'ok', transactionId: 'r-1' }, true],
  ])('keeps the handling fee with %s', async (_name, response, isSynchronous) => {
    const reserve = {
      ...registrationWithStaticDates,
      group: { key: 'reserve', number: 1 },
      paidAmount: 50,
    }
    const event = { ...eventWithStaticDates, cost: 50 }
    vi.mocked(createRefund).mockResolvedValueOnce(response)
    const { result } = renderHook(
      () => ({
        actions: useAdminRegistrationActions(eventWithStaticDates.id),
        registrations: useAtomValue(adminProjectedEventRegistrationsAtom(eventWithStaticDates.id)),
      }),
      {
        wrapper: ({ children }: { readonly children: React.ReactNode }) => (
          <Provider
            initializeState={({ set }) => {
              set(idTokenAtom, TEST_ID_TOKEN)
              set(adminEventsAtom, [event])
              set(adminEventRegistrationsAtom(event.id), [reserve])
            }}
          >
            {children}
          </Provider>
        ),
      }
    )

    await act(async () => {
      await result.current.actions.refund(reserve, 'payment-1', 4500, 500)
    })

    const row = result.current.registrations.find((r) => r.id === reserve.id)
    expect(row).toMatchObject({ openRefunds: ['r-1'], refundAmount: 45, refundHandlingCost: 5 })
    expect(row?.refundStatus).toBe(isSynchronous ? 'SUCCESS' : undefined)
    expect(row && getPaymentPicture(event, row, []).unsettled).toBe(false)
  })
})

describe('useKennelliittoResults', () => {
  const id = eventWithStaticDates.id
  const sentResult = {
    at: '2026-09-26T10:00:00.000Z',
    by: 'Sihteeri',
    day: '2026-09-26',
    payloadHash: 'h',
    resultVersion: '2026-09-26T09:00:00.000Z',
    status: 'sent' as const,
  }

  const sendOne = (kcResult: typeof sentResult | Omit<typeof sentResult, 'day'>) => {
    vi.mocked(registrationApi.sendKennelliittoResults).mockResolvedValueOnce({
      blockers: [],
      kcResults: [{ id: registrationWithStaticDates.id, kcResult }],
      notAttempted: [],
      reports: [],
    })
    const rendered = renderHook(
      () => ({ kc: useKennelliittoResults(id), registrations: useAtomValue(adminEventRegistrationsAtom(id)) }),
      { wrapper }
    )
    return rendered
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('holds the stored result of a sent dog with its time as a Date and its day as the day key it is', async () => {
    const { result } = sendOne(sentResult)

    await act(async () => {
      await result.current.kc.send([registrationWithStaticDates.id], false)
    })

    const { kcResult } = result.current.registrations[0]
    expect(kcResult?.at).toEqual(new Date('2026-09-26T10:00:00.000Z'))
    expect(kcResult?.day).toBe('2026-09-26')
  })

  it('has no day to convert when the stored result has none', async () => {
    const { day: _day, ...withoutDay } = sentResult
    const { result } = sendOne(withoutDay)

    await act(async () => {
      await result.current.kc.send([registrationWithStaticDates.id], false)
    })

    expect(result.current.registrations[0].kcResult?.at).toBeInstanceOf(Date)
    expect(result.current.registrations[0].kcResult).not.toHaveProperty('day')
  })

  it('does not read the list of a trial without a token, since an empty answer would say it has no dogs', async () => {
    const { result } = renderHook(() => useKennelliittoResults(id), {
      wrapper: ({ children }: { readonly children: React.ReactNode }) => (
        <Provider initializeState={({ set }) => set(idTokenAtom, '')}>{children}</Provider>
      ),
    })

    await expect(result.current.reload()).rejects.toThrow('missing token')
    expect(registrationApi.getRegistrations).not.toHaveBeenCalled()
  })
})
