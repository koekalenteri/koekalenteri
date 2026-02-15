import type { Registration, RegistrationGroup, RegistrationGroupInfo } from '../../../../types'
import type { DragItem } from './types'
import { renderHook } from '@testing-library/react'
import { rum } from '../../../../lib/client/rum'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../../lib/registration'
import { determineChangesFromDrop } from './dnd'
import { useDnDHandlers } from './useDnDHandlers'

// Mock dependencies
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('notistack', () => ({
  useSnackbar: () => ({
    enqueueSnackbar: jest.fn(),
  }),
}))

jest.mock('../../../../lib/client/rum', () => ({
  rum: jest.fn(() => ({
    recordEvent: jest.fn(),
  })),
}))

jest.mock('./dnd', () => ({
  determineChangesFromDrop: jest.fn(),
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

  const mockConfirm = jest.fn().mockResolvedValue({ confirmed: true })
  const mockSetSelectedRegistrationId = jest.fn()
  const mockSaveGroups = jest.fn().mockResolvedValue(undefined)
  const mockOnCancelOpen = jest.fn()

  const defaultProps = {
    canArrangeReserve: true,
    confirm: mockConfirm,
    onCancelOpen: mockOnCancelOpen,
    registrations: mockRegistrations,
    saveGroups: mockSaveGroups,
    setSelectedRegistrationId: mockSetSelectedRegistrationId,
    state: 'confirmed' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(determineChangesFromDrop as jest.Mock).mockReturnValue([])
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
      const mockConfirmWithStructure = jest.fn().mockResolvedValue({ confirmed: true })

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

      expect(mockConfirmWithStructure).toHaveBeenCalled()
      expect(mockConfirmWithStructure.mock.calls[0][0]).toMatchObject({
        description: expect.stringContaining('TestDog'),
        title: expect.stringContaining('TestDog'),
      })
    })

    it('should not proceed if confirmation is cancelled', async () => {
      const mockCancelledConfirm = jest.fn().mockResolvedValue({ confirmed: false })
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
      const mockConfirmWithStructure = jest.fn().mockResolvedValue({ confirmed: true })

      const props = {
        ...defaultProps,
        confirm: mockConfirmWithStructure,
        state: 'invited' as const,
      }

      const { result } = renderHook(() => useDnDHandlers(props))

      const dragItem = {
        ...mockDragItem,
        groupKey: GROUP_KEY_RESERVE,
      }

      await result.current.handleDrop(mockGroup)(dragItem)

      expect(mockConfirmWithStructure).toHaveBeenCalled()
      expect(mockConfirmWithStructure.mock.calls[0][0].description).toContain('koekutsu')
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
      ;(determineChangesFromDrop as jest.Mock).mockReturnValue(mockChanges)

      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(mockSaveGroups).toHaveBeenCalledWith('event1', mockChanges)
    })

    it('should call onCancelOpen when a single cancelled change is returned', async () => {
      const mockChanges: RegistrationGroupInfo[] = [
        { cancelled: true, eventId: 'event1', group: { key: GROUP_KEY_CANCELLED, number: 1 }, id: 'reg1' },
      ]
      ;(determineChangesFromDrop as jest.Mock).mockReturnValue(mockChanges)

      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(mockOnCancelOpen).toHaveBeenCalledWith('reg1')
      expect(mockSaveGroups).not.toHaveBeenCalled()
    })

    it('should not call saveGroups when no changes are returned', async () => {
      ;(determineChangesFromDrop as jest.Mock).mockReturnValue([])

      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      await result.current.handleDrop(mockGroup)(mockDragItem)

      expect(mockSaveGroups).not.toHaveBeenCalled()
    })
  })

  describe('handleReject', () => {
    const mockEnqueueSnackbar = jest.fn()

    beforeEach(() => {
      jest.spyOn(require('notistack'), 'useSnackbar').mockImplementation(() => ({
        enqueueSnackbar: mockEnqueueSnackbar,
      }))
    })

    it('should do nothing if registration is not found', () => {
      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      const invalidDragItem = { ...mockDragItem, id: 'nonexistent' }
      result.current.handleReject(mockGroup)(invalidDragItem)

      expect(mockEnqueueSnackbar).not.toHaveBeenCalled()
      expect(rum).not.toHaveBeenCalled()
    })

    it('should do nothing if registration is already in the same group', () => {
      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      const sameGroupDragItem = { ...mockDragItem }
      const sameGroup = { key: 'group1', number: 1 }

      result.current.handleReject(sameGroup)(sameGroupDragItem)

      expect(mockEnqueueSnackbar).not.toHaveBeenCalled()
      expect(rum).not.toHaveBeenCalled()
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
        message: expect.stringContaining('Varasijalla olevia koiria ei voi enää järjestellä'),
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
        message: expect.stringContaining('ei koirakkoa voi enää siirtää osallistujista varasijalle'),
        variant: 'warning',
      })
    })

    it('should record event and show error message when registration is not in the target group', () => {
      const mockRumRecordEvent = jest.fn()
      ;(rum as jest.Mock).mockReturnValue({
        recordEvent: mockRumRecordEvent,
      })

      const { result } = renderHook(() => useDnDHandlers(defaultProps))

      result.current.handleReject(mockGroup)(mockDragItem)

      expect(rum).toHaveBeenCalled()
      expect(mockRumRecordEvent).toHaveBeenCalledWith(
        'dnd-group-rejected',
        expect.objectContaining({
          eventId: 'event1',
          registrationId: 'reg1',
          sourceGroup: 'group1',
          targetGroup: 'group2',
        })
      )

      expect(mockEnqueueSnackbar).toHaveBeenCalledWith({
        message: expect.stringContaining('TestDog ei ole ilmoittautunut tähän ryhmään'),
        variant: 'error',
      })
    })
  })
})
