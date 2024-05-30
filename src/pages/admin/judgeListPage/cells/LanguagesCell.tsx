import type { GridRenderCellParams } from '@mui/x-data-grid'
import type React from 'react'
import type { Judge } from '../../../../types'

import { useCallback } from 'react'
import { styled } from '@mui/material'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { t } from 'i18next'
import { useRecoilValue } from 'recoil'

import { isAdminSelector } from '../../../recoil'
import { useJudgesActions } from '../../recoil'

const LangToggle = styled(ToggleButton)({ paddingTop: 1, paddingBottom: 1 })

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
      <LangToggle value="fi">{t('language.fi')}</LangToggle>
      <LangToggle value="sv">{t('language.sv')}</LangToggle>
      <LangToggle value="en">{t('language.en')}</LangToggle>
    </ToggleButtonGroup>
  )
}

export default LanguagesCell
