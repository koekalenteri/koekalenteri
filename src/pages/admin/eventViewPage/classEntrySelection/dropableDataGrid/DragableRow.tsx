import type { GridRowProps } from '@mui/x-data-grid'
import type { Identifier } from 'dnd-core'
import type { DragItem } from '../types'

import { useRef } from 'react'
import { useDrag, useDragDropManager, useDrop } from 'react-dnd'
import { GridRow } from '@mui/x-data-grid'

import { determinePosition } from './position'

// augment the props for the row slot
declare module '@mui/x-data-grid' {
  interface RowPropsOverrides {
    groupKey?: string
  }
}

interface Props extends GridRowProps {
  readonly groupKey?: string
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

      const position = determinePosition(sameGroup, dragIndex, hoverIndex, ref, item, monitor)

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
    item: { id: props.rowId, groups: props.row?.dropGroups, index: props.index, groupKey: groupKey },
    collect: (monitor) => ({
      opacity: monitor.isDragging() ? 0.4 : 1,
    }),
  })

  drag(drop(ref))

  return (
    <GridRow
      ref={ref}
      {...props}
      style={{
        opacity,
        display: 'flex',
        boxSizing: 'content-box',
      }}
      className={hovered ? `hovered ${position}` : ''}
      data-handler-id={handlerId}
    />
  )
}

export default DragableRow
