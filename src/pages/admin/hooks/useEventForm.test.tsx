import type { DogEvent } from '../../../types'
import { act, renderHook } from '@testing-library/react'
import { useSnackbar } from 'notistack'
import { useNavigate } from 'react-router'
import { RecoilRoot, useRecoilState, useResetRecoilState } from 'recoil'
import { adminEditableEventByIdAtom, adminNewEventAtom, useAdminEventActions } from '../recoil'
import useEventForm from './useEventForm'

// Mock dependencies
jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}))

jest.mock('notistack', () => ({
  useSnackbar: jest.fn(),
}))

jest.mock('../../../lib/utils', () => ({
  getChanges: jest.requireActual('../../../lib/utils').getChanges,
  isEmptyObject: jest.requireActual('../../../lib/utils').isEmptyObject,
}))

jest.mock('../recoil/events/actions', () => ({
  useAdminEventActions: jest.fn(),
}))

jest.mock('recoil', () => {
  const originalModule = jest.requireActual('recoil')
  return {
    ...originalModule,
    useRecoilState: jest.fn(),
    useResetRecoilState: jest.fn(),
  }
})

describe('useEventForm', () => {
  const mockNavigate = jest.fn()
  const mockEnqueueSnackbar = jest.fn()
  const mockSetEvent = jest.fn()
  const mockResetEvent = jest.fn()
  const mockSave = jest.fn()

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
    jest.clearAllMocks()

    // Setup mocks
    ;(useNavigate as jest.Mock).mockReturnValue(mockNavigate)
    ;(useSnackbar as jest.Mock).mockReturnValue({ enqueueSnackbar: mockEnqueueSnackbar })
    ;(useRecoilState as jest.Mock).mockReturnValue([mockEvent, mockSetEvent])
    ;(useResetRecoilState as jest.Mock).mockReturnValue(mockResetEvent)
    ;(useAdminEventActions as jest.Mock).mockReturnValue({
      save: mockSave,
    })
  })

  it('should initialize with correct state in create mode', () => {
    const { result } = renderHook(() => useEventForm(), {
      wrapper: RecoilRoot,
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
        wrapper: RecoilRoot,
      }
    )

    expect(result.current.event).toBe(mockEvent)
    expect(result.current.changes).toEqual({})
    expect(result.current.canSave).toBe(false)
    expect(useRecoilState).toHaveBeenCalledWith(adminEditableEventByIdAtom('test-event-id'))
  })

  it('should use adminNewEventAtom when no eventId is provided', () => {
    renderHook(() => useEventForm(), {
      wrapper: RecoilRoot,
    })

    expect(useRecoilState).toHaveBeenCalledWith(adminNewEventAtom)
  })

  it('should update event and track changes when handleChange is called', () => {
    const { result } = renderHook(
      () =>
        useEventForm({
          storedEvent: mockStoredEvent,
        }),
      {
        wrapper: RecoilRoot,
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
        wrapper: RecoilRoot,
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
        wrapper: RecoilRoot,
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
      wrapper: RecoilRoot,
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
        wrapper: RecoilRoot,
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
      wrapper: RecoilRoot,
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
      wrapper: RecoilRoot,
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
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('Save failed')
    mockSave.mockRejectedValue(error)

    const { result } = renderHook(() => useEventForm(), {
      wrapper: RecoilRoot,
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
    ;(useRecoilState as jest.Mock).mockReturnValue([null, mockSetEvent])

    const { result } = renderHook(() => useEventForm(), {
      wrapper: RecoilRoot,
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
        wrapper: RecoilRoot,
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
      wrapper: RecoilRoot,
    })

    act(() => {
      result.current.handleCancel()
    })

    expect(mockResetEvent).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
