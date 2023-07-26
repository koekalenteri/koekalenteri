import type { DataGridProps } from '@mui/x-data-grid'
import type { DropTargetMonitor } from 'react-dnd'
import type { DragItem } from './dropableDataGrid/DragableRow'

import { useMemo } from 'react'
import { useDrop } from 'react-dnd'

import StyledDataGrid from '../../../components/StyledDataGrid'

import DragableRow from './dropableDataGrid/DragableRow'

interface Props extends DataGridProps {
  canDrop?: (item?: DragItem) => boolean
  onDrop?: (item: DragItem) => any
  onReject?: (item: DragItem) => any
  group?: string
  flex?: number
}

interface DragCollect {
  canDrop: boolean
  isOver: boolean
  isDragging: boolean
}

const DropableDataGrid = (props: Props) => {
  const getCanDrop = (item?: DragItem) =>
    (!props.group || !!item?.groups.includes(props.group)) && props.canDrop?.(item) !== false
  const [{ canDrop, isOver, isDragging }, ref] = useDrop<DragItem, void, DragCollect>(
    () => ({
      accept: 'row',
      collect: (monitor) => {
        const item = monitor.getItem()
        return {
          isOver: monitor.isOver(),
          canDrop: getCanDrop(item),
          isDragging: item !== null,
        }
      },
      drop: (item: DragItem, monitor: DropTargetMonitor<DragItem, void>) => {
        if (getCanDrop(item)) {
          if (item.targetGroupKey && item.targetGroupKey !== (props.group ?? 'reserve')) {
            // clean up possible stale move information from different group
            delete item.targetGroupKey
          }
          props.onDrop?.(item)
        } else {
          props.onReject?.(item)
        }
      },
    }),
    [props.onDrop]
  )

  const className = useMemo(() => {
    const result = []
    if (canDrop) {
      result.push('accept')
    } else if (isDragging) {
      result.push('reject')
    }
    if (isOver) {
      result.push('over')
    }
    return result.join(' ')
  }, [canDrop, isDragging, isOver])

  return (
    <div ref={ref} className={className} style={{ display: 'flex', flexGrow: props.flex ?? 1, width: '100%' }}>
      <StyledDataGrid
        {...props}
        slots={{
          ...props.slots,
          row: DragableRow,
        }}
        sx={[
          {
            minHeight: 100,
            overflow: 'visible',
            '& .MuiDataGrid-virtualScrollerContent': {
              marginBottom: '3px',
            },
            '.reject & .MuiDataGrid-main': { bgcolor: 'error.main', opacity: 0.5, color: 'error.main' },
            '[data-field="dog.regNo"]:hover::after': {
              content: '""',
              width: '15px',
              height: '15px',
              background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' class='MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-i4bv87-MuiSvgIcon-root' focusable='false' aria-hidden='true' viewBox='0 0 24 24' data-testid='ContentCopyOutlinedIcon'%3E%3Cpath d='M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'%3E%3C/path%3E%3C/svg%3E")`,
              position: 'relative',
              top: '1px',
              left: '0px',
              display: 'inline-block',
            },
            '.accept & .hovered.before': {
              borderTop: '3px solid #F2C94C',
            },
            '.accept & .hovered.after': {
              borderBottom: '3px solid #F2C94C',
            },
          },
          ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
        ]}
      />
    </div>
  )
}

export default DropableDataGrid
