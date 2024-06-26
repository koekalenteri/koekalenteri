import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { ChangeEvent } from 'react'
import type { Judge } from '../../../../types'

import { useCallback } from 'react'
import Switch from '@mui/material/Switch'
import { useRecoilValue } from 'recoil'

import { isAdminSelector } from '../../../recoil'
import { useAdminJudgesActions } from '../../recoil'

const ActiveCell = (props: GridRenderCellParams<Judge, boolean>) => {
  const actions = useAdminJudgesActions()
  const isAdmin = useRecoilValue(isAdminSelector)

  const toggleActive = useCallback(
    async (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      actions.save({ ...props.row, active: checked })
    },
    [actions, props.row]
  )

  return (
    <Switch
      checked={!!props.value}
      onChange={toggleActive}
      disabled={!isAdmin}
      size="small"
      sx={{ verticalAlign: 'unset' }}
    />
  )
}

export default ActiveCell
