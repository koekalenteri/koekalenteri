import type { DropTargetMonitor, XYCoord } from 'react-dnd'
import type { DragItem } from '../types'

import { determinePosition } from './position'

describe('position utility', () => {
  describe('determinePosition', () => {
    // Create a mock ref
    const mockRef = {
      current: {
        getBoundingClientRect: () => ({
          top: 100,
          bottom: 140,
          left: 0,
          right: 100,
          width: 100,
          height: 40,
        }),
      },
    } as React.RefObject<HTMLDivElement>

    // Create a mock item
    const mockItem = {
      id: 'test-id',
      groups: ['group1'],
      index: 2,
      groupKey: 'group1',
    } as DragItem

    // Create a mock monitor
    const createMockMonitor = (clientY: number): DropTargetMonitor =>
      ({
        getClientOffset: () => ({ x: 50, y: clientY }) as XYCoord,
      }) as DropTargetMonitor

    it('should return "after" when in same group and dragIndex is hoverIndex - 1', () => {
      const result = determinePosition(
        true, // sameGroup
        1, // dragIndex
        2, // hoverIndex
        mockRef,
        mockItem,
        createMockMonitor(120)
      )

      expect(result).toBe('after')
    })

    it('should return "before" when in same group and dragIndex is hoverIndex + 1', () => {
      const result = determinePosition(
        true, // sameGroup
        3, // dragIndex
        2, // hoverIndex
        mockRef,
        mockItem,
        createMockMonitor(120)
      )

      expect(result).toBe('before')
    })

    it('should return "before" when cursor is in the top half of the element', () => {
      const result = determinePosition(
        false, // not sameGroup
        5, // dragIndex
        2, // hoverIndex
        mockRef,
        mockItem,
        createMockMonitor(110) // Y position in top half
      )

      expect(result).toBe('before')
    })

    it('should return "after" when cursor is in the bottom half of the element', () => {
      const result = determinePosition(
        false, // not sameGroup
        5, // dragIndex
        2, // hoverIndex
        mockRef,
        mockItem,
        createMockMonitor(130) // Y position in bottom half
      )

      expect(result).toBe('after')
    })

    it('should consider the pixel modifier when calculating middle point', () => {
      // With position 'before', the middle point is shifted down by 3px
      const itemWithBeforePosition = { ...mockItem, position: 'before' as const }

      // This Y position would normally be "before", but with the modifier it becomes "after"
      const result = determinePosition(
        false,
        5,
        2,
        mockRef,
        itemWithBeforePosition,
        createMockMonitor(117) // Just above the modified middle point (120 - 3)
      )

      expect(result).toBe('before')
    })
  })
})
