import type { GridRowId, GridRowProps } from '@mui/x-data-grid'
import type { Identifier, XYCoord } from 'dnd-core'

import { useRef } from 'react'
import { useDrag, useDragDropManager, useDrop } from 'react-dnd'
import { GridRow } from '@mui/x-data-grid'

export interface DragItem {
  id: GridRowId
  index: number
  groupKey?: string
  groups: string[]
  targetGroupKey?: string
  targetIndex?: number
  position?: 'before' | 'after'
}

interface Props extends GridRowProps {
  groupKey?: string
}

const DragableRow = ({ groupKey, ...props }: Props) => {
  const manager = useDragDropManager()
  const ref = useRef<HTMLDivElement>(null)
  const [{ handlerId, hovered, position }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: Identifier | null; hovered: boolean; position: 'before' | 'after' | undefined }
  >({
    accept: 'row',
    collect: (monitor) => {
      const item = monitor.getItem()
      return {
        handlerId: monitor.getHandlerId(),
        hovered: monitor.isOver() && !!item && !!item.targetGroupKey,
        position: item?.position,
      }
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return
      }
      const sameGroup = item.groupKey === groupKey
      const dragIndex = item.index
      const hoverIndex = props.index

      if (dragIndex === hoverIndex && sameGroup) {
        delete item.targetGroupKey
        return
      }

      let position: 'before' | 'after' = 'before'
      if (sameGroup && dragIndex === hoverIndex - 1) {
        position = 'after'
      } else if (sameGroup && dragIndex === hoverIndex + 1) {
        position = 'before'
      } else {
        const hoverBoundingRect = ref.current.getBoundingClientRect()
        const mod = item.position === 'before' ? 3 : item.position === 'after' ? -3 : 0
        const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2 + mod
        const clientOffset = monitor.getClientOffset()
        const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top
        position = hoverClientY < hoverMiddleY ? 'before' : 'after'
      }
      item.targetGroupKey = groupKey
      item.targetIndex = hoverIndex
      if (item.position !== position) {
        item.position = position
        manager.getActions().hover([])
      }
    },
  })

  const [{ opacity }, drag] = useDrag<DragItem, void, { opacity: number }>({
    type: 'row',
    item: { id: props.rowId, groups: props.row?.groups, index: props.index, groupKey: groupKey },
    collect: (monitor) => ({
      opacity: monitor.isDragging() ? 0.4 : 1,
    }),
  })

  drag(drop(ref))

  return (
    <div
      ref={ref}
      style={{
        opacity,
        display: 'flex',
      }}
      className={hovered ? `hovered ${position}` : ''}
      data-handler-id={handlerId}
    >
      <GridRow {...props} />
    </div>
  )
}

export default DragableRow
