import type { GridRenderCellParams } from '@mui/x-data-grid'
import type React from 'react'
import type { Judge } from '../../../../types'

import { useCallback } from 'react'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { t } from 'i18next'
import { useRecoilValue } from 'recoil'

import { isAdminSelector, useJudgesActions } from '../../../recoil'

const LanguagesCell = (props: GridRenderCellParams<Judge, Judge>) => {
  const actions = useJudgesActions()
  const isAdmin = useRecoilValue(isAdminSelector)

  const changeLanguges = useCallback(
    (_event: React.MouseEvent<HTMLElement, MouseEvent>, languages: string[]) => {
      actions.save({ ...props.row, languages })
    },
    [actions, props.row]
  )

  return (
    <ToggleButtonGroup color={'info'} value={props.value} fullWidth onChange={changeLanguges} disabled={!isAdmin}>
      <ToggleButton value="fi">{t('language.fi')}</ToggleButton>
      <ToggleButton value="sv">{t('language.sv')}</ToggleButton>
      <ToggleButton value="en">{t('language.en')}</ToggleButton>
    </ToggleButtonGroup>
  )
}

export default LanguagesCell
