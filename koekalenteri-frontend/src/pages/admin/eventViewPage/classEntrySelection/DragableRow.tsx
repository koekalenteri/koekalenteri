import { useDrag } from 'react-dnd'
import { GridRow, GridRowId, GridRowProps } from '@mui/x-data-grid'

export interface DragItem {
  id: GridRowId
  groups: string[]
}

const DragableRow = (props: GridRowProps) => {
  const [{opacity}, ref] = useDrag<DragItem, void, {opacity: number}>(
    () =>
      ({
        type: 'row',
        item: { id: props.rowId, groups: props.row?.groups },
        collect: (monitor) => ({opacity: monitor.isDragging() ? 0.4 : 1}),
        end: (item) => console.log('end', item),
      }),
    [props.rowId],
  )

  return (
    <div ref={ref} style={{opacity}}>
      <GridRow  {...props}/>
    </div>
  )
}

export default DragableRow
