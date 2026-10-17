import type { Registration, RegistrationGroup, RegistrationGroupInfo } from '@/types'
import type { DragItem } from './types'
import { renderHook } from '@testing-library/react'
import { eventWithStaticDatesAnd3Classes } from '@/__mockData__/events'
import { recordEvent } from '@/lib/client/rum'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '@/lib/registration'
import { determineChangesFromDrop } from './dnd'
import { useDnDHandlers } from './useDnDHandlers'

const { mockEnqueueSnackbar } = vi.hoisted(() => ({ mockEnqueueSnackbar: vi.fn() }))

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Spells the key and its option names out, the same way the global mock does
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${Object.keys(opts).join(', ')}` : key),
  }),
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({
    enqueueSnackbar: mockEnqueueSnackbar,
  }),
}))

vi.mock('@/lib/client/rum', () => ({
  recordEvent: vi.fn(),
}))

vi.mock('./dnd', () => ({
  determineChangesFromDrop: vi.fn(),
}))

describe('useDnDHandlers', () => {
  // Common test data
  const mockRegistration: Registration = {
    createdAt: new Date(),
    dates: [{ date: new Date(), time: 'ap' }],
    dog: { name: 'TestDog', regNo: 'TEST123' },
    eventId: 'event1',
    group: { key: 'group1', number: 1 },
    id: 'reg1',
    modifiedAt: new Date(),
    // A paid place: the prompt reads it to promise the koekutsu with the place.
    paymentStatus: 'SUCCESS',
    // The handlers read only the fields above; the minimal fixture converts here.
  } as unknown as Registration

  const mockRegistrations: Registration[] = [mockRegistration]

  const mockGroup: RegistrationGroup = {
    date: new Date(),
    key: 'group2',
    number: 2,
    time: 'ap',
  }

  const mockDragItem: DragItem = {
    groupKey: 'group1',
    groups: ['group1', 'group2'],
    id: 'reg1',
    index: 0,
  }

  const mockConfirm = vi.fn().mockResolvedValue({ confirmed: true })
  const mockSetSelectedRegistrationId = vi.fn()
  const mockSaveGroups = vi.fn().mockResolvedValue(undefined)
  const mockOnCancelOpen = vi.fn()

  const defaultProps = {
    canArrangeReserve: true,
    confirm: mockConfirm,
    event: eventWithStaticDatesAnd3Classes,
    onCancelOpen: mockOnCancelOpen,
    registrations: mockRegistrations,
    saveGroups: mockSaveGroups,
    setSelectedRegistrationId: mockSetSelectedRegistrationId,
    state: 'confirmed' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(determineChangesFromDrop as import('vitest').Mock).mockReturnValue([])
  })

  describe('handleDrop', () => {
    it('should do nothing if registration is not found', async () => {
      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      const invalidDragItem = { ...mockDragItem, id: 'nonexistent' }
      await result.current.handleDrop(mockGroup)(invalidDragItem)

      expect(mockSetSelectedRegistrationId).not.toHaveBeenCalled()
      expect(determineChangesFromDrop).not.toHaveBeenCalled()
      expect(mockSaveGroups).not.toHaveBeenCalled()
    })

    it('should show confirmation dialog when required', async () => {
      const mockConfirmWithStructure = vi.fn().mockResolvedValue({ confirmed: true })

      const props = {
        ...defaultProps,
        confirm: mockConfirmWithStructure,
        state: 'picked' as const,
      }

      const { result } = renderHook(() => useDnDHandlers(props))

      const dragItem = {
        ...mockDragItem,
        groupKey: GROUP_KEY_RESERVE,
      }

      await result.current.handleDrop(mockGroup)(dragItem)

      expect(mockConfirmWithStructure).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('moveToParticipants.description'),
          title: expect.stringContaining('moveToParticipants.title'),
        })
      )
    })

    it('should not proceed if confirmation is cancelled', async () => {
      const mockCancelledConfirm = vi.fn().mockResolvedValue({ confirmed: false })
      const props = {
        ...defaultProps,
        confirm: mockCancelledConfirm,
        state: 'picked' as const,
      }

      const { result } = renderHook(() => useDnDHandlers(props))

      const dragItem = {
        ...mockDragItem,
        groupKey: GROUP_KEY_RESERVE,
      }

      await result.current.handleDrop(mockGroup)(dragItem)

      expect(mockSetSelectedRegistrationId).not.toHaveBeenCalled()
      expect(determineChangesFromDrop).not.toHaveBeenCalled()
      expect(mockSaveGroups).not.toHaveBeenCalled()
    })

    it('should include extra text in confirmation for invited state', async () => {
      // Mock confirm to return the expected structure
      const mockConfirmWithStructure = vi.fn().mockResolvedValue({ confirmed: true })

      const props = {
        ...defaultProps,
        confirm: mockConfirmWithStructure,
        event: { ...eventWithStaticDatesAnd3Classes, state: 'invited' as const },
        state: 'invited' as const,
      }

      const { result } = renderHook(() => useDnDHandlers(props))

      const dragItem = {
        ...mockDragItem,
        groupKey: GROUP_KEY_RESERVE,
      }

      await result.current.handleDrop(mockGroup)(dragItem)

      expect(mockConfirmWithStructure).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining('context') })
      )
    })

    it('should not confirm when a dog that already holds a place changes day', async () => {
      // Only a dog coming off the reserve or cancelled list is mailed its place (KOE-289), so a
      // move between two participant groups must not promise a message the backend never sends.
      const mockUnusedConfirm = vi.fn().mockResolvedValue({ confirmed: true })

      const props = {
        ...defaultProps,
        confirm: mockUnusedConfirm,
        state: 'picked' as const,
      }

      const { result } = renderHook(() => useDnDHandlers(props))

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(mockUnusedConfirm).not.toHaveBeenCalled()
      expect(mockSetSelectedRegistrationId).toHaveBeenCalledWith('reg1')
    })

    it('anchors on a start stored with the UTC day key, which the grid lists in the group (KOE-1541)', async () => {
      const date = new Date('2026-08-14T21:00:00.000Z') // 15.8. 00:00 in Helsinki
      const group: RegistrationGroup = { date, key: '2026-08-15-ap', number: 0, time: 'ap' }
      const start = (id: string, number: number): Registration => ({
        ...mockRegistration,
        group: { date, key: '2026-08-14-ap', number, time: 'ap' },
        id,
      })
      const reserve: Registration = { ...mockRegistration, group: { key: GROUP_KEY_RESERVE, number: 1 } }
      const siblings = [start('a', 1), start('b', 2)]
      ;(determineChangesFromDrop as import('vitest').Mock).mockReturnValue([
        { eventId: 'event1', group: { ...group, number: 1.5 }, id: 'reg1' },
      ])

      const { result } = renderHook(() => useDnDHandlers({ ...defaultProps, registrations: [reserve, ...siblings] }))
      await result.current.handleDrop(group)({ ...mockDragItem, groupKey: GROUP_KEY_RESERVE })

      expect(determineChangesFromDrop).toHaveBeenCalledWith(expect.anything(), group, reserve, siblings, true)
      expect(mockSaveGroups).toHaveBeenCalledWith('event1', [
        { beforeId: 'b', cancelReason: undefined, group: { date, key: '2026-08-15-ap', time: 'ap' }, id: 'reg1' },
      ])
    })

    it('should set selected registration ID', async () => {
      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(mockSetSelectedRegistrationId).toHaveBeenCalledWith('reg1')
    })

    it('should call determineChangesFromDrop with correct parameters', async () => {
      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(determineChangesFromDrop).toHaveBeenCalledWith(mockDragItem, mockGroup, mockRegistration, [], true)
    })

    it('should call saveGroups when changes are returned', async () => {
      const mockChanges: RegistrationGroupInfo[] = [
        { eventId: 'event1', group: { key: 'group2', number: 1 }, id: 'reg1' },
      ]
      ;(determineChangesFromDrop as import('vitest').Mock).mockReturnValue(mockChanges)

      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(mockSaveGroups).toHaveBeenCalledWith('event1', [
        { cancelReason: undefined, group: { date: undefined, key: 'group2', time: undefined }, id: 'reg1' },
      ])
    })

    it('anchors the drop on a starter, not on a cancelled entry left in the target group (KOE-1537)', async () => {
      // Listed under cancelled in the grid, but its stale key still names the target group.
      const staleCancelled: Registration = {
        ...mockRegistration,
        cancelled: true,
        group: { key: 'group2', number: 2 },
        id: 'stale',
      }
      const starter: Registration = { ...mockRegistration, group: { key: 'group2', number: 2 }, id: 'starter' }
      const mockChanges: RegistrationGroupInfo[] = [
        { eventId: 'event1', group: { key: 'group2', number: 1.5 }, id: 'reg1' },
      ]
      ;(determineChangesFromDrop as import('vitest').Mock).mockReturnValue(mockChanges)

      const { result } = renderHook(() =>
        useDnDHandlers({ ...defaultProps, registrations: [mockRegistration, staleCancelled, starter] })
      )

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(determineChangesFromDrop).toHaveBeenCalledWith(mockDragItem, mockGroup, mockRegistration, [starter], true)
      expect(mockSaveGroups).toHaveBeenCalledWith('event1', [
        {
          beforeId: 'starter',
          cancelReason: undefined,
          group: { date: undefined, key: 'group2', time: undefined },
          id: 'reg1',
        },
      ])
    })

    it('should call onCancelOpen when a single cancelled change is returned', async () => {
      const mockChanges: RegistrationGroupInfo[] = [
        { cancelled: true, eventId: 'event1', group: { key: GROUP_KEY_CANCELLED, number: 1 }, id: 'reg1' },
      ]
      ;(determineChangesFromDrop as import('vitest').Mock).mockReturnValue(mockChanges)

      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(mockOnCancelOpen).toHaveBeenCalledWith('reg1')
      expect(mockSaveGroups).not.toHaveBeenCalled()
    })

    it('should not call saveGroups when no changes are returned', async () => {
      ;(determineChangesFromDrop as import('vitest').Mock).mockReturnValue([])

      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(mockSaveGroups).not.toHaveBeenCalled()
    })
  })

  describe('handleReject', () => {
    it('should do nothing if registration is not found', () => {
      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      const invalidDragItem = { ...mockDragItem, id: 'nonexistent' }
      result.current.handleReject(mockGroup)(invalidDragItem)

      expect(mockEnqueueSnackbar).not.toHaveBeenCalled()
      expect(recordEvent).not.toHaveBeenCalled()
    })

    it('should do nothing if registration is already in the same group', () => {
      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      const sameGroupDragItem = { ...mockDragItem }
      const sameGroup = { key: 'group1', number: 1 }

      result.current.handleReject(sameGroup)(sameGroupDragItem)

      expect(mockEnqueueSnackbar).not.toHaveBeenCalled()
      expect(recordEvent).not.toHaveBeenCalled()
    })

    it('should show info message when trying to arrange reserve dogs after notifications', () => {
      // Create a registration with the same group key as the reserve group
      const reserveRegistration = {
        ...mockRegistration,
        group: { key: GROUP_KEY_RESERVE, number: 1 },
      }

      const props = {
        ...defaultProps,
        registrations: [reserveRegistration],
      }

      const { result } = renderHook(() => useDnDHandlers(props))

      const reserveGroup = { key: GROUP_KEY_RESERVE, number: 1 }
      const sameGroupDragItem = {
        ...mockDragItem,
        groupKey: GROUP_KEY_RESERVE,
        id: reserveRegistration.id,
      }

      result.current.handleReject(reserveGroup)(sameGroupDragItem)

      expect(mockEnqueueSnackbar).toHaveBeenCalledWith({
        message: 'eventManagement.participantSelection.reserveLocked',
        variant: 'info',
      })
    })

    it('should show warning when trying to move from participants to reserve after picking', () => {
      const props = {
        ...defaultProps,
        state: 'picked' as const,
      }

      const { result } = renderHook(() => useDnDHandlers(props))

      const reserveGroup = { key: GROUP_KEY_RESERVE, number: 1 }

      result.current.handleReject(reserveGroup)(mockDragItem)

      expect(mockEnqueueSnackbar).toHaveBeenCalledWith({
        message: 'eventManagement.participantSelection.cannotMoveToReserve',
        variant: 'warning',
      })
    })

    it('should record event and show error message when registration is not in the target group', () => {
      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      result.current.handleReject(mockGroup)(mockDragItem)

      expect(recordEvent).toHaveBeenCalledWith(
        'dnd-group-rejected',
        expect.objectContaining({
          eventId: 'event1',
          registrationId: 'reg1',
          sourceGroup: 'group1',
          targetGroup: 'group2',
        })
      )

      expect(mockEnqueueSnackbar).toHaveBeenCalledWith({
        message: 'eventManagement.participantSelection.notRegisteredToGroup dogName',
        persist: true,
        variant: 'error',
      })
    })
  })
})
