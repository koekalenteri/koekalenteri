import React from 'react';
import { useDrag } from 'react-dnd'
import { GridRow, GridRowId, GridRowProps } from '@mui/x-data-grid';

export interface DragItem {
  id: GridRowId
}
const DragableRow = (props: GridRowProps) => {
  const [{opacity}, drag] = useDrag<DragItem, void, {opacity: number}>(
    () =>
      ({
        type: 'row',
        item: { id: props.rowId },
        collect: (monitor) => ({opacity: monitor.isDragging() ? 0.4 : 1,}),
        end: (item) => console.log('end', item)
      }),
    [props.rowId]
  )

  return (
    <div ref={drag} style={{opacity}}>
      <GridRow  {...props}/>
    </div>
  )
}

export default DragableRow
