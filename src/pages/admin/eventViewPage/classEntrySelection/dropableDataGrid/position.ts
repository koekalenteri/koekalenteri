import type { XYCoord } from 'react-dnd'
import type { DragItem } from '../types'

export const determinePosition = (
  sameGroup: boolean,
  dragIndex: number,
  hoverIndex: number,
  ref: React.RefObject<HTMLDivElement>,
  item: DragItem,
  monitor: any
): 'before' | 'after' => {
  if (sameGroup && dragIndex === hoverIndex - 1) {
    return 'after'
  }

  if (sameGroup && dragIndex === hoverIndex + 1) {
    return 'before'
  }

  // Calculate position based on mouse position
  const hoverBoundingRect = ref.current!.getBoundingClientRect()
  const mod = item.position === 'before' ? 3 : item.position === 'after' ? -3 : 0
  const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2 + mod
  const clientOffset = monitor.getClientOffset()
  const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top

  return hoverClientY < hoverMiddleY ? 'before' : 'after'
}
