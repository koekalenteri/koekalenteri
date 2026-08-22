import type { DogEvent } from '../../../types'
import { act, renderHook } from '@testing-library/react'
import { Provider, useAtom } from 'jotai'
import { useResetAtom } from 'jotai/utils'
import { useSnackbar } from 'notistack'
import { useNavigate } from 'react-router'
import { adminEditableEventByIdAtom, adminNewEventAtom, useAdminEventActions } from '../state'
import useEventForm from './useEventForm'

// Mock dependencies
vi.mock('react-router', async () => ({
  useNavigate: vi.fn(),
}))

vi.mock('notistack', async () => ({
  useSnackbar: vi.fn(),
}))

vi.mock('../state/events/actions', async () => ({
  useAdminEventActions: vi.fn(),
}))

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
  const mockSave = vi.fn()

  const mockEvent: DogEvent = {
    classes: [],
    cost: 35,
    costMember: 30,
    createdAt: new Date(),
    createdBy: 'test',
    description: 'Test description',
    endDate: new Date('2023-01-02'),
    entryEndDate: new Date('2022-12-31'),
    entryStartDate: new Date('2022-12-01'),
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
    startDate: new Date('2023-01-01'),
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
    ;(useAdminEventActions as import('vitest').Mock).mockReturnValue({
      save: mockSave,
    })
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
          storedEvent: mockEvent,
        }),
      {
        wrapper: Provider,
      }
    )

    expect(result.current.event).toBe(mockEvent)
    expect(result.current.changes).toEqual({})
    expect(result.current.canSave).toBe(false)
    expect(useAtom).toHaveBeenCalledWith(adminEditableEventByIdAtom('test-event-id'))
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
      result.current.handleChange({ ...mockEvent, entryStartDate: new Date('2022-11-30') })
    })

    expect(result.current.changes).toEqual({ entryStartDate: new Date('2022-11-30') })
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
      result.current.handleChange({ ...mockEvent, entryStartDate: new Date('2022-11-30') })
    })
    expect(result.current.changes).toEqual({ entryStartDate: new Date('2022-11-30') })
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
    const { result } = renderHook(() => useEventForm({ eventId: mockEvent.id, storedEvent: mockStoredEvent }), {
      wrapper: Provider,
    })

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
    const { result } = renderHook(() => useEventForm({ eventId: mockEvent.id, storedEvent: mockStoredEvent }), {
      wrapper: Provider,
    })

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
    expect(mockResetEvent).not.toHaveBeenCalled()
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
})
