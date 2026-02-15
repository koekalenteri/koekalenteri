import type { GridRowProps } from '@mui/x-data-grid'
import type { Identifier } from 'dnd-core'
import type { DragItem } from '../types'
import { GridRow, useGridApiContext } from '@mui/x-data-grid'
import { useRef } from 'react'
import { useDrag, useDragDropManager, useDrop } from 'react-dnd'
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

const DraggableRow = ({ groupKey, ...props }: Props) => {
  const apiRef = useGridApiContext()
  const manager = useDragDropManager()
  const ref = useRef<HTMLDivElement>(null)

  // MUI X may render a "row" slot with `row`/`rowId` temporarily null/undefined
  // (e.g. during drag operations / virtualization updates). Guard against it so
  // our DnD hooks don't create items with missing ids.
  const rowId = (props.rowId ?? (props.row as any)?.id) as unknown
  const hasRowId = rowId !== null && rowId !== undefined
  const canDrag = hasRowId && props.row !== null && props.row !== undefined

  // In MUI X v7 during cross-grid moves we can end up rendering a row slot for an
  // id that is temporarily missing from the grid state. The internal `GridRow`
  // then crashes while reading `row.id` inside `useGridRowAriaAttributes`.
  //
  // If the row isn't present in the grid state, render a harmless placeholder.
  const rowFromState = hasRowId ? apiRef.current.getRow(rowId as any) : null
  const canRenderGridRow = !!rowFromState
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
    canDrag,
    collect: (monitor) => ({
      opacity: monitor.isDragging() ? 0.4 : 1,
    }),
    item: () => ({
      groupKey: groupKey,
      groups: (props.row as any)?.dropGroups ?? [],
      id: rowId as any,
      index: props.index,
    }),
    type: 'row',
  })

  // Only attach DnD refs when we have a valid id.
  if (canDrag && canRenderGridRow) {
    drag(drop(ref))
  }

  // MUI X v7 can briefly pass a null `row` into the row slot while rows are
  // being re-rendered (this shows up when dragging between grids). If we pass
  // that through to MUI's `GridRow`, it can crash while reading `row.id`.
  //
  // Important: we *must not* early-return before hooks, so render a harmless
  // placeholder instead.
  if (!props.row || !canRenderGridRow) {
    return <div ref={ref} style={{ height: props.style?.height ?? 40 }} />
  }

  return (
    <GridRow
      ref={ref}
      {...props}
      style={{
        boxSizing: 'content-box',
        display: 'flex',
        opacity,
      }}
      className={hovered ? `hovered ${position}` : ''}
      data-handler-id={handlerId}
    />
  )
}

export default DraggableRow
