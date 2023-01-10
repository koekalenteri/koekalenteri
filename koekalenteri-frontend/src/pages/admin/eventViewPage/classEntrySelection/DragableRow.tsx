import { useRef } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { GridRow, GridRowId, GridRowProps } from '@mui/x-data-grid'
import type { Identifier, XYCoord } from 'dnd-core'

export interface DragItem {
  id: GridRowId
  index: number
  groupKey?: string
  groups: string[],
  move?: MoveTarget
}

export interface MoveTarget {
  groupKey?: string
  index: number
  position: 'before' | 'after'
}

interface Props extends GridRowProps {
  groupKey?: string
}

const DragableRow = ({groupKey, ...props}: Props) => {
  const ref = useRef<HTMLDivElement>(null)
  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: Identifier | null }>({
    accept: 'row',
    collect: (monitor) => ({ handlerId: monitor.getHandlerId() }),
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return
      }
      const sameGroup = item.groupKey === groupKey
      const dragIndex = item.index
      const hoverIndex = props.index

      if (dragIndex === hoverIndex && sameGroup) {
        delete item.move
        return
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect()
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2
      const clientOffset = monitor.getClientOffset()
      const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top
      const position = hoverClientY < hoverMiddleY ? 'before' : 'after'
      if (sameGroup) {
        if ((position === 'before' && dragIndex === hoverIndex - 1) ||
            (position === 'after' && dragIndex === hoverIndex + 1)) {
          delete item.move
          return
        }
      }
      const move = item.move || (item.move = {} as MoveTarget)
      move.groupKey = groupKey
      move.index = hoverIndex
      move.position = position
    },
  })

  const [{opacity}, drag] = useDrag<DragItem, void, {opacity: number}>({
    type: 'row',
    item: { id: props.rowId, groups: props.row?.groups, index: props.index, groupKey: groupKey },
    collect: (monitor) => ({opacity: monitor.isDragging() ? 0.4 : 1}),
  })

  drag(drop(ref))
  return (
    <div ref={ref} style={{opacity}} data-handler-id={handlerId}>
      <GridRow  {...props}/>
    </div>
  )
}

export default DragableRow
