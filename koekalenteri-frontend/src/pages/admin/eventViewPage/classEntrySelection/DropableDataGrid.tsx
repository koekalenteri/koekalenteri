import { useRef } from "react"
import { useDrop } from "react-dnd"
import { DataGridProps, GridRowId } from "@mui/x-data-grid"

import { StyledDataGrid } from '../../../../components'

import DragableRow, { DragItem } from './DragableRow'

interface Props extends DataGridProps {
  onDrop?: (item: { id: GridRowId }) => any
}

const DropableDataGrid = (props: Props) => {
  const ref = useRef<HTMLDivElement>(null)
  const [{ canDrop, isOver }, drop] = useDrop<DragItem, void, { canDrop: boolean, isOver: boolean }>(() => ({
    accept: 'row',
    drop: props.onDrop,
    collect: (monitor) => {
      return {
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }
    },
  }), [props.onDrop])

  const isActive = canDrop && isOver
  let backgroundColor = '#fff'
  if (isActive) {
    backgroundColor = 'darkgreen'
  } else if (canDrop) {
    backgroundColor = 'darkkhaki'
  }

  drop(ref)
  return (
    <div ref={ref} style={{ backgroundColor, width: '100%', height: '100%' }}>
      <StyledDataGrid {...props} components={{
        ...props.components,
        Row: DragableRow,
      }} />
    </div>
  )
}

export default DropableDataGrid
