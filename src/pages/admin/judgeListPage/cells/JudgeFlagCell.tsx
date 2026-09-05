import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { ChangeEvent } from 'react'
import type { Judge } from '../../../../types'
import Switch from '@mui/material/Switch'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { isAdminAtom } from '../../../state'
import { useAdminJudgesActions } from '../../state'

/** The judge's flags that the app keeps itself, outside the Kennel Club sync. */
type JudgeFlag = 'active' | 'mockTrial'

/** A switch on one of the judge's own flags: an admin flips it, everyone else sees where it stands. */
export const createJudgeFlagCell = (flag: JudgeFlag) => {
  const JudgeFlagCell = (props: GridRenderCellParams<Judge, boolean>) => {
    const actions = useAdminJudgesActions()
    const isAdmin = useAtomValue(isAdminAtom)

    const toggle = useCallback(
      (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
        actions.save({ ...props.row, [flag]: checked })
      },
      [actions, props.row]
    )

    return (
      <Switch
        checked={!!props.value}
        onChange={toggle}
        disabled={!isAdmin}
        size="small"
        sx={{ verticalAlign: 'unset' }}
      />
    )
  }
  return JudgeFlagCell
}
