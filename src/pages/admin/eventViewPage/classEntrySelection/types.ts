import type { GridRowId } from '@mui/x-data-grid'
import type { Registration } from '../../../../types'

export interface DragItem {
  id: GridRowId
  index: number
  groupKey?: string
  groups: string[]
  targetGroupKey?: string
  targetIndex?: number
  position?: 'before' | 'after'
}

export interface RegistrationWithGroups extends Registration {
  groups: string[]
  dropGroups: string[]
}
