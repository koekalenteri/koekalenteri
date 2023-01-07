import { useDrop } from "react-dnd"
import { DataGridProps, GridRowId } from "@mui/x-data-grid"

import { StyledDataGrid } from '../../../../components'

import DragableRow, { DragItem } from './DragableRow'

interface Props extends DataGridProps {
  onDrop?: (item: { id: GridRowId }) => any
  group?: string
  flex?: number
}

interface DragCollect {
  canDrop: boolean
  isOver: boolean
  isDragging: boolean
}

const DropableDataGrid = (props: Props) => {
  const [{ canDrop, isOver, isDragging }, ref] = useDrop<DragItem, void, DragCollect>(() => ({
    accept: 'row',
    canDrop: (item) => !props.group || item.groups.includes(props.group),
    drop: props.onDrop,
    collect: (monitor) => {
      return {
        isOver: monitor.isOver({shallow: true}),
        canDrop: monitor.canDrop(),
        isDragging: monitor.getItem() !== null,
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
      <StyledDataGrid {...props} sx={{'& .MuiDataGrid-cell:first-child': {padding: 0}}} components={{
        ...props.components,
        Row: DragableRow,
      }} />
    </div>
  )
}

export default DropableDataGrid
