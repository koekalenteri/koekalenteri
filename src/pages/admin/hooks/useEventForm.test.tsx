import type { DogEvent } from '@/types'
import { act, renderHook } from '@testing-library/react'
import { Provider, useAtom } from 'jotai'
import { useResetAtom } from 'jotai/utils'
import { useSnackbar } from 'notistack'
import { useNavigate } from 'react-router'
import { APIError } from '@/api/http'
import { errorSnackbarOptions } from '@/lib/client/snackbar'
import { adminEditableEventByIdAndFormAtom, adminNewEventAtom } from '../state'
import useEventForm from './useEventForm'

const { mockSave } = vi.hoisted(() => ({ mockSave: vi.fn() }))

// Mock dependencies
vi.mock('react-router', async () => ({
  useNavigate: vi.fn(),
}))

vi.mock('notistack', async () => ({
  useSnackbar: vi.fn(),
}))

vi.mock('../state/events/actions', async () => {
  const { atom } = await vi.importActual<typeof import('jotai')>('jotai')
  return {
    adminSaveEventAtom: atom(
      null,
      (
        _get,
        _set,
        {
          confirmDrops,
          event,
          formChanges,
        }: { event: DogEvent; formChanges?: Partial<DogEvent>; confirmDrops?: string }
      ) => {
        if (confirmDrops) return mockSave(event, formChanges, confirmDrops)
        return formChanges ? mockSave(event, formChanges) : mockSave(event)
      }
    ),
  }
})

vi.mock('jotai', async () => {
  const originalModule = await vi.importActual<typeof import('jotai')>('jotai')
  return {
    ...originalModule,
    useAtom: vi.fn(),
  }
})
vi.mock('jotai/utils', async () => ({
  ...(await vi.importActual<typeof import('jotai/utils')>('jotai/utils')),
  useResetAtom: vi.fn(),
}))

describe('useEventForm', () => {
  const mockNavigate = vi.fn()
  const mockEnqueueSnackbar = vi.fn()
  const mockSetEvent = vi.fn()
  const mockResetEvent = vi.fn()

  const mockEvent: DogEvent = {
    classes: [],
    cost: 35,
    costMember: 30,
    createdAt: new Date(),
    createdBy: 'test',
    description: 'Test description',
    endDate: '2023-01-02',
    entryEndDate: '2022-12-31',
    entryStartDate: '2022-12-01',
    eventType: 'test',
    id: 'test-event-id',
    judges: [],
    location: 'Test Location',
    modifiedAt: new Date(),
    modifiedBy: 'test',
    name: 'Test Event',
    official: {},
    organizer: { id: 'org1', name: 'Test Organizer' },
    places: 10,
    secretary: {},
    startDate: '2023-01-01',
    state: 'draft',
  }

  const mockStoredEvent: DogEvent = {
    ...mockEvent,
    name: 'Original Event Name',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mocks
    ;(useNavigate as import('vitest').Mock).mockReturnValue(mockNavigate)
    ;(useSnackbar as import('vitest').Mock).mockReturnValue({ enqueueSnackbar: mockEnqueueSnackbar })
    ;(useAtom as import('vitest').Mock).mockReturnValue([mockEvent, mockSetEvent])
    ;(useResetAtom as import('vitest').Mock).mockReturnValue(mockResetEvent)
  })

  it('should initialize with correct state in create mode', () => {
    const { result } = renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    expect(result.current.event).toBe(mockEvent)
    expect(result.current.changes).toEqual({})
    expect(result.current.canSave).toBe(true) // In create mode, always true
    expect(typeof result.current.handleChange).toBe('function')
    expect(typeof result.current.handleSave).toBe('function')
    expect(typeof result.current.handleCancel).toBe('function')
  })

  it('should initialize with correct state in edit mode', () => {
    const { result } = renderHook(
      () =>
        useEventForm({
          eventId: 'test-event-id',
          form: 'edit',
          storedEvent: mockEvent,
        }),
      {
        wrapper: Provider,
      }
    )

    expect(result.current.event).toBe(mockEvent)
    expect(result.current.changes).toEqual({})
    expect(result.current.canSave).toBe(false)
    expect(useAtom).toHaveBeenCalledWith(adminEditableEventByIdAndFormAtom({ eventId: 'test-event-id', form: 'edit' }))
  })

  it('should use adminNewEventAtom when no eventId is provided', () => {
    renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    expect(useAtom).toHaveBeenCalledWith(adminNewEventAtom)
  })

  it('should update event and track changes when handleChange is called', () => {
    const { result } = renderHook(
      () =>
        useEventForm({
          storedEvent: mockStoredEvent,
        }),
      {
        wrapper: Provider,
      }
    )

    const updatedEvent = { ...mockEvent, name: 'Updated Event Name' }

    act(() => {
      result.current.handleChange(updatedEvent)
    })

    expect(mockSetEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ...updatedEvent,
        modifiedAt: expect.any(Date),
      })
    )
    expect(result.current.changes).toEqual({ name: updatedEvent.name })
    expect(result.current.canSave).toBe(true)
  })

  it('tracks entry date changes from actual value differences', () => {
    const { result } = renderHook(
      () =>
        useEventForm({
          storedEvent: mockEvent,
        }),
      {
        wrapper: Provider,
      }
    )

    expect(result.current.changes).toEqual({})
    expect(result.current.canSave).toBe(false)

    act(() => {
      result.current.handleChange({ ...mockEvent, entryStartDate: '2022-11-30' })
    })

    expect(result.current.changes).toEqual({ entryStartDate: '2022-11-30' })
    expect(result.current.canSave).toBe(true)
  })

  it('clears entry date changes when values match the stored event again', () => {
    const { result } = renderHook(
      () =>
        useEventForm({
          storedEvent: mockEvent,
        }),
      {
        wrapper: Provider,
      }
    )

    act(() => {
      result.current.handleChange({ ...mockEvent, entryStartDate: '2022-11-30' })
    })
    expect(result.current.changes).toEqual({ entryStartDate: '2022-11-30' })
    expect(result.current.canSave).toBe(true)

    act(() => {
      result.current.handleChange(mockEvent)
    })

    expect(result.current.changes).toEqual({})
    expect(result.current.canSave).toBe(false)
  })

  it('should not track changes in create mode', () => {
    const { result } = renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    const updatedEvent = { ...mockEvent, name: 'Updated Event Name' }

    act(() => {
      result.current.handleChange(updatedEvent)
    })

    expect(mockSetEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ...updatedEvent,
        modifiedAt: expect.any(Date),
      })
    )
    expect(result.current.changes).toEqual({ name: updatedEvent.name })
    expect(result.current.canSave).toBe(true)
  })

  it('should save event and navigate when handleSave is called', async () => {
    mockSave.mockResolvedValue({ ...mockEvent, state: 'confirmed' })

    const { result } = renderHook(
      () =>
        useEventForm({
          onDoneRedirect: '/events',
        }),
      {
        wrapper: Provider,
      }
    )

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockSave).toHaveBeenCalledWith(mockEvent)
    expect(mockResetEvent).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/events')
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.any(String), { variant: 'info' })
  })

  it('should save only locally edited fields with the original modification timestamp in edit mode', async () => {
    mockSave.mockResolvedValue({ ...mockEvent, name: 'Updated Event Name' })
    const { result } = renderHook(
      () => useEventForm({ eventId: mockEvent.id, form: 'edit', storedEvent: mockStoredEvent }),
      {
        wrapper: Provider,
      }
    )

    act(() => {
      result.current.handleChange({ ...mockEvent, name: 'Updated Event Name' })
    })
    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test Event' }), {
      modifiedAt: mockEvent.modifiedAt,
      name: 'Updated Event Name',
    })
  })

  it('uses the latest modification timestamp for consecutive saves', async () => {
    const savedModifiedAt = new Date('2025-01-02T12:00:00Z')
    mockSave
      .mockResolvedValueOnce({ ...mockEvent, modifiedAt: savedModifiedAt, name: 'First change' })
      .mockResolvedValueOnce({ ...mockEvent, modifiedAt: new Date('2025-01-02T13:00:00Z'), name: 'Second change' })
    const { result } = renderHook(
      () => useEventForm({ eventId: mockEvent.id, form: 'edit', storedEvent: mockStoredEvent }),
      {
        wrapper: Provider,
      }
    )

    act(() => {
      result.current.handleChange({ ...mockEvent, name: 'First change' })
    })
    await act(async () => {
      await result.current.handleSave()
    })
    act(() => {
      result.current.handleChange({ ...mockEvent, name: 'Second change' })
    })
    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockSave).toHaveBeenNthCalledWith(1, expect.anything(), {
      modifiedAt: mockEvent.modifiedAt,
      name: 'First change',
    })
    expect(mockSave).toHaveBeenNthCalledWith(2, expect.anything(), {
      modifiedAt: savedModifiedAt,
      name: 'Second change',
    })
  })

  it('should handle errors during save', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('Save failed')
    mockSave.mockRejectedValue(error)

    const { result } = renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockSave).toHaveBeenCalledWith(mockEvent)
    expect(consoleErrorSpy).toHaveBeenCalledWith(error)
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith('event.saveFailed', errorSnackbarOptions)
    expect(mockResetEvent).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('tells the secretary when the server refuses the save for lack of a right', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new APIError({ status: 403, statusText: 'Forbidden' } as Response, 'Forbidden')
    mockSave.mockRejectedValue(error)

    const { result } = renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockEnqueueSnackbar).toHaveBeenCalledWith('event.saveForbidden', errorSnackbarOptions)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(mockResetEvent).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('tells the secretary when the server fails the save for a reason it does not name', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new APIError({ status: 500, statusText: 'Internal Server Error' } as Response, {})
    mockSave.mockRejectedValue(error)

    const { result } = renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockEnqueueSnackbar).toHaveBeenCalledWith('event.saveFailed', errorSnackbarOptions)
    expect(consoleErrorSpy).toHaveBeenCalledWith(error)
    expect(mockResetEvent).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('should show a conflict snackbar when the kcId is already linked to another event', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new APIError({ status: 409, statusText: '' } as Response, { error: 'kcIdConflict' })
    mockSave.mockRejectedValue(error)

    const { result } = renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockEnqueueSnackbar).toHaveBeenCalledWith('event.kcIdConflict', errorSnackbarOptions)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(mockResetEvent).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  // KOE-1534: the trial is already linked, said without mentioning a koetunnus. KOE-1568: the event's
  // registrations lock its payment terms.
  it.each(['kcGuidConflict', 'officialFormatClassShape', 'officialFormatLocked', 'paymentLocked'])(
    'should name the refusal for a %s conflict',
    async (refusal) => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSave.mockRejectedValue(new APIError({ status: 409, statusText: '' } as Response, { error: refusal }))

      const { result } = renderHook(() => useEventForm(), {
        wrapper: Provider,
      })

      await act(async () => {
        await result.current.handleSave()
      })

      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(`event.${refusal}`, errorSnackbarOptions)
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    }
  )

  // KOE-674: the save reads every registration, cancelled and unpaid ones too, which the form cannot
  // all see; a class taken from under them is named.
  it('names the classes whose entries keep the save from taking them away', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSave.mockRejectedValue(
      new APIError({ status: 400, statusText: 'Bad Request' } as Response, {
        error: 'invalidOwnClasses',
        errors: [
          { code: 'ALO', kind: 'registered' },
          { code: 'AVO', kind: 'registered' },
        ],
      })
    )

    const { result } = renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockEnqueueSnackbar).toHaveBeenCalledWith('event.ownClasses.refused list', errorSnackbarOptions)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('should not attempt to save if event is null', async () => {
    ;(useAtom as import('vitest').Mock).mockReturnValue([null, mockSetEvent])

    const { result } = renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockSave).not.toHaveBeenCalled()
  })

  it('should reset event and navigate when handleCancel is called', () => {
    const { result } = renderHook(
      () =>
        useEventForm({
          onDoneRedirect: '/events',
        }),
      {
        wrapper: Provider,
      }
    )

    act(() => {
      result.current.handleCancel()
    })

    expect(mockResetEvent).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/events')
  })

  it('should reset event but not navigate when no redirect is provided', () => {
    const { result } = renderHook(() => useEventForm(), {
      wrapper: Provider,
    })

    act(() => {
      result.current.handleCancel()
    })

    expect(mockResetEvent).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  describe('a change that drops recorded scores (KOE-1666)', () => {
    const asked = {
      confirmation: 'drops-1',
      dogs: [{ class: 'ALO', id: 'dog-a', name: 'Hukka', number: 1, tasks: 1 }],
      error: 'resultTasksDropped',
    }
    const dropped = () => new APIError({ status: 409, statusText: 'Conflict' } as Response, asked)

    it('asks instead of reporting a failure, and keeps the form as edited', async () => {
      mockSave.mockRejectedValueOnce(dropped())
      const onSaved = vi.fn()
      const { result } = renderHook(() => useEventForm({ onDoneRedirect: '/events', onSaved }), { wrapper: Provider })

      await act(async () => {
        await result.current.handleSave()
      })

      expect(result.current.dropsDialogProps).toMatchObject({ dogs: asked.dogs, open: true })
      expect(mockEnqueueSnackbar).not.toHaveBeenCalled()
      expect(mockResetEvent).not.toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
    })

    it('saves again with the confirmation it was given once the secretary confirms', async () => {
      mockSave.mockRejectedValueOnce(dropped()).mockResolvedValueOnce(mockEvent)
      const onSaved = vi.fn()
      const { result } = renderHook(() => useEventForm({ onDoneRedirect: '/events', onSaved }), { wrapper: Provider })
      await act(async () => {
        await result.current.handleSave()
      })

      await act(async () => {
        await result.current.dropsDialogProps.onConfirm()
      })

      expect(mockSave).toHaveBeenLastCalledWith(mockEvent, undefined, 'drops-1')
      expect(result.current.dropsDialogProps.open).toBe(false)
      expect(mockNavigate).toHaveBeenCalledWith('/events')
      expect(onSaved).toHaveBeenCalledTimes(1)
    })

    it('saves nothing when the secretary cancels', async () => {
      mockSave.mockRejectedValueOnce(dropped())
      const { result } = renderHook(() => useEventForm(), { wrapper: Provider })
      await act(async () => {
        await result.current.handleSave()
      })

      act(() => {
        result.current.dropsDialogProps.onCancel()
      })

      expect(result.current.dropsDialogProps.open).toBe(false)
      expect(mockSave).toHaveBeenCalledTimes(1)
    })

    it('says so when the results are handed over and the change would alter them', async () => {
      mockSave.mockRejectedValueOnce(
        new APIError({ status: 423, statusText: 'Locked' } as Response, { error: 'resultsLocked' })
      )
      const { result } = renderHook(() => useEventForm(), { wrapper: Provider })

      await act(async () => {
        await result.current.handleSave()
      })

      expect(mockEnqueueSnackbar).toHaveBeenCalledWith('event.resultsLocked', errorSnackbarOptions)
    })
  })
})
