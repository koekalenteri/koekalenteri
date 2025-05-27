import type { XYCoord } from 'react-dnd'
import type { DragItem } from '../types'

import { determinePosition } from './position'

describe('position', () => {
  describe('determinePosition', () => {
    // Mock React.RefObject with HTMLDivElement
    const createRefMock = (top: number, bottom: number) => {
      // Create a partial mock of HTMLDivElement with just the methods we need
      const mockElement = {
        getBoundingClientRect: () => ({
          top,
          bottom,
          // Other properties not used by the function
          left: 0,
          right: 0,
          width: 0,
          height: bottom - top,
          x: 0,
          y: top,
        }),
      } as HTMLDivElement

      return { current: mockElement } as React.RefObject<HTMLDivElement>
    }

    // Mock monitor
    const createMonitorMock = (y: number) => ({
      getClientOffset: () => ({ x: 0, y }) as XYCoord,
    })

    // Test cases for adjacent items in the same group
    it('should return "after" when in same group and dragIndex is one less than hoverIndex', () => {
      const sameGroup = true
      const dragIndex = 1
      const hoverIndex = 2
      const ref = createRefMock(0, 100)
      const item: DragItem = { id: '1', index: dragIndex, groups: [] }
      const monitor = createMonitorMock(50)

      const result = determinePosition(sameGroup, dragIndex, hoverIndex, ref, item, monitor)
      expect(result).toBe('after')
    })

    it('should return "before" when in same group and dragIndex is one more than hoverIndex', () => {
      const sameGroup = true
      const dragIndex = 3
      const hoverIndex = 2
      const ref = createRefMock(0, 100)
      const item: DragItem = { id: '1', index: dragIndex, groups: [] }
      const monitor = createMonitorMock(50)

      const result = determinePosition(sameGroup, dragIndex, hoverIndex, ref, item, monitor)
      expect(result).toBe('before')
    })

    // Test cases for position calculation based on mouse position
    it('should return "before" when mouse is in the upper half of the element', () => {
      const sameGroup = false
      const dragIndex = 1
      const hoverIndex = 5
      const ref = createRefMock(0, 100)
      const item: DragItem = { id: '1', index: dragIndex, groups: [] }
      const monitor = createMonitorMock(30) // Mouse in upper half

      const result = determinePosition(sameGroup, dragIndex, hoverIndex, ref, item, monitor)
      expect(result).toBe('before')
    })

    it('should return "after" when mouse is in the lower half of the element', () => {
      const sameGroup = false
      const dragIndex = 1
      const hoverIndex = 5
      const ref = createRefMock(0, 100)
      const item: DragItem = { id: '1', index: dragIndex, groups: [] }
      const monitor = createMonitorMock(70) // Mouse in lower half

      const result = determinePosition(sameGroup, dragIndex, hoverIndex, ref, item, monitor)
      expect(result).toBe('after')
    })

    // Test cases for position adjustment based on item.position
    it('should adjust the middle point when item.position is "before"', () => {
      const sameGroup = false
      const dragIndex = 1
      const hoverIndex = 5
      const ref = createRefMock(0, 100)
      const item: DragItem = { id: '1', index: dragIndex, groups: [], position: 'before' }
      const monitor = createMonitorMock(53) // Just above the middle (50), but with +3 modifier it should be "after"

      const result = determinePosition(sameGroup, dragIndex, hoverIndex, ref, item, monitor)
      expect(result).toBe('after')
    })

    it('should adjust the middle point when item.position is "after"', () => {
      const sameGroup = false
      const dragIndex = 1
      const hoverIndex = 5
      const ref = createRefMock(0, 100)
      const item: DragItem = { id: '1', index: dragIndex, groups: [], position: 'after' }
      const monitor = createMonitorMock(46) // Just above the middle (50), with -4 modifier (46) it should be "before"

      const result = determinePosition(sameGroup, dragIndex, hoverIndex, ref, item, monitor)
      expect(result).toBe('before')
    })

    // Test case for non-adjacent items in the same group
    it('should calculate position based on mouse position when in same group but not adjacent', () => {
      const sameGroup = true
      const dragIndex = 1
      const hoverIndex = 5 // Not adjacent to dragIndex
      const ref = createRefMock(0, 100)
      const item: DragItem = { id: '1', index: dragIndex, groups: [] }
      const monitor = createMonitorMock(70) // Mouse in lower half

      const result = determinePosition(sameGroup, dragIndex, hoverIndex, ref, item, monitor)
      expect(result).toBe('after')
    })

    // Edge cases
    it('should handle edge case when mouse is exactly at the middle', () => {
      const sameGroup = false
      const dragIndex = 1
      const hoverIndex = 5
      const ref = createRefMock(0, 100)
      const item: DragItem = { id: '1', index: dragIndex, groups: [] }
      const monitor = createMonitorMock(50) // Mouse exactly at the middle

      const result = determinePosition(sameGroup, dragIndex, hoverIndex, ref, item, monitor)
      expect(result).toBe('after') // According to the implementation, it should be 'after'
    })
  })
})
