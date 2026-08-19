import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { ChangeEvent } from 'react'
import type { Judge } from '../../../../types'
import Switch from '@mui/material/Switch'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { isAdminAtom } from '../../../state'
import { useAdminJudgesActions } from '../../state'

const ActiveCell = (props: GridRenderCellParams<Judge, boolean>) => {
  const actions = useAdminJudgesActions()
  const isAdmin = useAtomValue(isAdminAtom)

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
