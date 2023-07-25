import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { Judge } from 'koekalenteri-shared/model'
import type { ChangeEvent } from 'react'

import { useCallback } from 'react'
import Switch from '@mui/material/Switch'
import { useRecoilValue } from 'recoil'

import { isAdminSelector, useJudgesActions } from '../../../recoil'

const ActiveCell = (props: GridRenderCellParams<Judge, boolean>) => {
  const actions = useJudgesActions()
  const isAdmin = useRecoilValue(isAdminSelector)

  const toggleActive = useCallback(
    async (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      actions.save({ ...props.row, active: checked })
    },
    [actions, props.row]
  )

  return <Switch checked={!!props.value} onChange={toggleActive} disabled={!isAdmin} />
}

export default ActiveCell
