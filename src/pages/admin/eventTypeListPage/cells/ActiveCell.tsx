import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { ChangeEvent } from 'react'
import type { EventType } from '../../../../types'

import { useCallback } from 'react'
import Switch from '@mui/material/Switch'

import { useAdminEventTypeActions } from '../../recoil'

const ActiveCell = (props: GridRenderCellParams<EventType, boolean>) => {
  const actions = useAdminEventTypeActions()

  const toggleActive = useCallback(
    async (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      actions.save({ ...props.row, active: checked })
    },
    [actions, props.row]
  )

  return <Switch checked={!!props.value} onChange={toggleActive} />
}

export default ActiveCell
