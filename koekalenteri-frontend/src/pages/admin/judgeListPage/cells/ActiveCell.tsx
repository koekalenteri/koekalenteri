import { ChangeEvent, useCallback } from 'react'
import { Switch } from '@mui/material'
import { GridRenderCellParams } from '@mui/x-data-grid'
import { Judge } from 'koekalenteri-shared/model'

import { useJudgesActions } from '../../../recoil/judges'

const ActiveCell = (props: GridRenderCellParams<boolean, Judge>) => {
  const actions = useJudgesActions()

  const toggleActive = useCallback(
    async (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      actions.save({ ...props.row, active: checked })
    },
    [actions, props.row],
  )

  return <Switch checked={!!props.value} onChange={toggleActive} />
}

export default ActiveCell
