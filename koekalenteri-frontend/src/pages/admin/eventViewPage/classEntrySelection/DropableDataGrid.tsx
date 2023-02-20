import { DropTargetMonitor, useDrop } from 'react-dnd'
import { DataGridProps } from '@mui/x-data-grid'

import StyledDataGrid from '../../../components/StyledDataGrid'

import DragableRow, { DragItem } from './DragableRow'

interface Props extends DataGridProps {
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
  const getCanDrop = (item?: DragItem) => !props.group || !!item?.groups.includes(props.group)
  const [{ canDrop, isOver, isDragging }, ref] = useDrop<DragItem, void, DragCollect>(() => ({
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
  }), [props.onDrop])

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
    <div ref={ref} className={classNames.join(' ')} style={{ display: 'flex', flex: props.flex ?? 1, width: '100%', height: '100%' }}>
      <StyledDataGrid {...props} components={{
        ...props.components,
        Row: DragableRow,
      }}
      sx={[{
        '& .MuiDataGrid-cell:first-of-type': {padding: 0},
        '.reject & .MuiDataGrid-main': { bgcolor: 'error.main', opacity: 0.1, color: 'error.main' },
      },
      ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
      />
    </div>
  )
}

export default DropableDataGrid
