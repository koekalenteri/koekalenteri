import type { GridRowId } from '@mui/x-data-grid'

export interface DragItem {
  id: GridRowId
  index: number
  groupKey?: string
  groups: string[]
  targetGroupKey?: string
  targetIndex?: number
  position?: 'before' | 'after'
}
