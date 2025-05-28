import type { DropTargetMonitor, XYCoord } from 'react-dnd'
import type { DragItem } from '../types'

const getPixelModifierByPosition = (position: DragItem['position']) => {
  if (position === 'before') return 3
  if (position === 'after') return -3
  return 0
}

export const determinePosition = (
  sameGroup: boolean,
  dragIndex: number,
  hoverIndex: number,
  ref: React.RefObject<HTMLDivElement>,
  item: DragItem,
  monitor: DropTargetMonitor
): 'before' | 'after' => {
  if (sameGroup && dragIndex === hoverIndex - 1) {
    return 'after'
  }

  if (sameGroup && dragIndex === hoverIndex + 1) {
    return 'before'
  }

  // Calculate position based on mouse position
  const hoverBoundingRect = ref.current!.getBoundingClientRect()
  const mod = getPixelModifierByPosition(item.position)
  const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2 + mod
  const clientOffset = monitor.getClientOffset()
  const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top

  return hoverClientY < hoverMiddleY ? 'before' : 'after'
}
