import { ChangeEvent, useCallback } from 'react'
import Switch from '@mui/material/Switch'
import { GridRenderCellParams } from '@mui/x-data-grid'
import { EventType } from 'koekalenteri-shared/model'

import { useEventTypeActions } from '../../../recoil'

const ActiveCell = (props: GridRenderCellParams<EventType, boolean>) => {
  const actions = useEventTypeActions()

  const toggleActive = useCallback(
    async (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      actions.save({ ...props.row, active: checked })
    },
    [actions, props.row]
  )

  return <Switch checked={!!props.value} onChange={toggleActive} />
}

export default ActiveCell
