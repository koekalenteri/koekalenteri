import { DropTargetMonitor, useDrop } from 'react-dnd'
import { DataGridProps } from '@mui/x-data-grid'

import StyledDataGrid from '../../../components/StyledDataGrid'

import DragableRow, { DragItem } from './DragableRow'

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
      drop: (item: DragItem, monitor: DropTargetMonitor<DragItem, void>) => {
        if (getCanDrop(item)) {
          if (item.move && item.move.groupKey !== props.group) {
            // clean up possible stale move information from different group
            delete item.move
          }
          props.onDrop?.(item)
        } else {
          props.onReject?.(item)
        }
      },
      collect: (monitor) => {
        const item = monitor.getItem()
        return {
          isOver: monitor.isOver(),
          canDrop: getCanDrop(item),
          isDragging: item !== null,
        }
      },
    }),
    [props.onDrop]
  )

  const classNames = []
  if (canDrop) {
    classNames.push('accept')
  } else if (isDragging) {
    classNames.push('reject')
  }
  if (isOver) {
    classNames.push('over')
  }

  return (
    <div
      ref={ref}
      className={classNames.join(' ')}
      style={{ display: 'flex', flexGrow: props.flex ?? 1, width: '100%' }}
    >
      <StyledDataGrid
        {...props}
        components={{
          ...props.components,
          Row: DragableRow,
        }}
        sx={[
          {
            minHeight: 100,
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
          },
          ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
        ]}
      />
    </div>
  )
}

export default DropableDataGrid
