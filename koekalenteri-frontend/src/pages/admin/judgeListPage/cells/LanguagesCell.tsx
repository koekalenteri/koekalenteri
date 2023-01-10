import React, { useCallback } from 'react'
import { ToggleButton, ToggleButtonGroup } from '@mui/material'
import { GridRenderCellParams } from '@mui/x-data-grid'
import { t } from 'i18next'
import { Judge } from 'koekalenteri-shared/model'

import { useJudgesActions } from "../../../recoil"

const LanguagesCell = (props: GridRenderCellParams<Judge, Judge>) => {
  const actions = useJudgesActions()

  const changeLanguges = useCallback(
    (_event: React.MouseEvent<HTMLElement, MouseEvent>, languages: string[]) => {
      actions.save({ ...props.row, languages })
    },
    [actions, props.row],
  )

  return (
    <ToggleButtonGroup
      color={'info'}
      value={props.value}
      fullWidth
      onChange={changeLanguges}
    >
      <ToggleButton value="fi">{t('language.fi')}</ToggleButton>
      <ToggleButton value="sv">{t('language.sv')}</ToggleButton>
      <ToggleButton value="en">{t('language.en')}</ToggleButton>
    </ToggleButtonGroup>
  )
}

export default LanguagesCell
