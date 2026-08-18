import type React from 'react'
import type { ManualTestResult } from '../../../types'
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

  it('cancels registration with patch operations', async () => {
    const registration = { ...registrationWithStaticDates, editToken: 'participant-token' }
    const savedRegistration = { ...registration, cancelled: true, cancelReason: 'dog-heat' }
    jest.spyOn(registrationApi, 'patchRegistration').mockResolvedValueOnce(savedRegistration)

    const { result } = renderHook(() => useRegistrationActions(), { wrapper })

    let saved: Awaited<ReturnType<typeof result.current.cancel>> | undefined
    await act(async () => {
      saved = await result.current.cancel(registration, 'dog-heat')
    })

    expect(registrationApi.patchRegistration).toHaveBeenCalledWith(
      {
        eventId: registration.eventId,
        id: registration.id,
        operations: [
          { path: ['cancelReason'], type: 'CREATE', value: 'dog-heat' },
          { path: ['cancelled'], type: 'CREATE', value: true },
        ],
      },
      'participant-token'
    )
    expect(saved).toBe(savedRegistration)
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith('registration.cancelDialog.done', { variant: 'info' })
  })

  it('confirms registration with the participant edit token', async () => {
    const registration = { ...registrationWithStaticDates, editToken: 'participant-token' }
    const confirmedRegistration = { ...registration, confirmed: true }
    jest.spyOn(registrationApi, 'patchRegistration').mockResolvedValueOnce(confirmedRegistration)

    const { result } = renderHook(() => useRegistrationActions(), { wrapper })

    await act(async () => {
      await result.current.confirm(registration)
    })

    expect(registrationApi.patchRegistration).toHaveBeenCalledWith(
      {
        eventId: registration.eventId,
        id: registration.id,
        operations: [{ path: ['confirmed'], type: 'CREATE', value: true }],
      },
      'participant-token'
    )
  })

  it('saves edited registration with patch operations', async () => {
    const savedRegistration = { ...registrationWithStaticDates, editToken: 'participant-token' }
    const editedRegistration = { ...savedRegistration, notes: 'changed notes' }
    jest.spyOn(registrationApi, 'patchRegistration').mockResolvedValueOnce(editedRegistration)

    const { result } = renderHook(() => useRegistrationActions(), { wrapper })

    let saved: Awaited<ReturnType<typeof result.current.save>> | undefined
    await act(async () => {
      saved = await result.current.save(editedRegistration, eventWithStaticDates, savedRegistration)
    })

    expect(registrationApi.patchRegistration).toHaveBeenCalledWith(
      {
        eventId: savedRegistration.eventId,
        id: savedRegistration.id,
        operations: [{ path: ['notes'], type: 'CHANGE', value: 'changed notes' }],
      },
      'participant-token'
    )
    expect(registrationApi.patchRegistration).not.toHaveBeenCalledWith(
      expect.objectContaining({ dog: expect.anything() })
    )
    expect(saved).toBe(editedRegistration)
  })

  it('does not send client-derived qualification fields when adding a result', async () => {
    const savedRegistration = {
      ...registrationWithStaticDates,
      results: [],
      shouldPay: true,
      updatedAt: new Date('2026-08-16T12:21:00.000Z'),
    }
    const manualResult: ManualTestResult = {
      class: 'NOU',
      date: new Date('2026-08-16T12:20:03.714Z'),
      id: 'manual-result',
      judge: 'Judge',
      location: 'Location',
      official: false,
      regNo: registrationWithStaticDates.dog.regNo,
      result: 'NOU1',
      type: 'NOU',
    }
    const editedRegistration = {
      ...savedRegistration,
      group: { key: 'reserve', number: 1 },
      qualifies: false,
      qualifyingResults: [{ ...manualResult, qualifying: true }],
      results: [manualResult],
      shouldPay: undefined,
      updatedAt: new Date('2026-08-16T12:19:41.030Z'),
    }
    jest.spyOn(registrationApi, 'patchRegistration').mockResolvedValueOnce(editedRegistration)

    const { result } = renderHook(() => useRegistrationActions(), { wrapper })

    await act(async () => {
      await result.current.save(editedRegistration, eventWithStaticDates, savedRegistration)
    })

    expect(registrationApi.patchRegistration).toHaveBeenCalledWith(
      {
        eventId: savedRegistration.eventId,
        id: savedRegistration.id,
        operations: [{ path: ['results', 0], type: 'CREATE', value: manualResult }],
      },
      undefined
    )
  })

  it('handles 304 from save action as a successful no-op', async () => {
    const editedRegistration = { ...registrationWithStaticDates, notes: 'changed notes' }
    jest
      .spyOn(registrationApi, 'patchRegistration')
      .mockRejectedValueOnce(new APIError(new Response(null, { status: 304, statusText: 'Not Modified' }), ''))

    const { result } = renderHook(() => useRegistrationActions(), { wrapper })

    let saved: Awaited<ReturnType<typeof result.current.save>> | undefined
    await act(async () => {
      saved = await result.current.save(editedRegistration, eventWithStaticDates, registrationWithStaticDates)
    })

    expect(registrationApi.patchRegistration).toHaveBeenCalledWith(
      {
        eventId: registrationWithStaticDates.eventId,
        id: registrationWithStaticDates.id,
        operations: [{ path: ['notes'], type: 'CHANGE', value: 'changed notes' }],
      },
      undefined
    )
    expect(saved).toEqual(editedRegistration)
  })

  it('handles save conflicts and returns undefined', async () => {
    jest.spyOn(registrationApi, 'postRegistration').mockRejectedValueOnce(
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
