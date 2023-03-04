import { ChangeEvent, useCallback } from 'react'
import { Switch } from '@mui/material'
import { GridRenderCellParams } from '@mui/x-data-grid'
import { EventType } from 'koekalenteri-shared/model'

import { useEventTypeActions } from '../../../recoil'

const ActiveCell = (props: GridRenderCellParams<boolean, EventType>) => {
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
