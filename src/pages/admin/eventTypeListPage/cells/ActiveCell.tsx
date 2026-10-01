import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { ChangeEvent } from 'react'
import type { EventType } from '@/types'
import Switch from '@mui/material/Switch'
import { useCallback } from 'react'
import { reportError } from '@/lib/client/error'
import { useAdminEventTypeActions } from '../../state'

const ActiveCell = (props: GridRenderCellParams<EventType, boolean>) => {
  const actions = useAdminEventTypeActions()

  const toggleActive = useCallback(
    (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      void actions.save({ ...props.row, active: checked }).catch(reportError)
    },
    [actions, props.row]
  )

  return <Switch checked={!!props.value} onChange={toggleActive} size="small" sx={{ verticalAlign: 'unset' }} />
}

export default ActiveCell
