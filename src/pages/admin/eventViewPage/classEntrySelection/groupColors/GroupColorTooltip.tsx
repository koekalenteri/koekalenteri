import type { ReactElement } from 'react'
import type { RegistrationDate } from '../../../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Tooltip from '@mui/material/Tooltip'

interface Props {
  readonly children: ReactElement
  readonly selected: RegistrationDate[]
}

const GroupColorTooltip = ({ selected, children }: Props) => {
  const { t } = useTranslation()
  const title = useMemo(
    () =>
      selected.length &&
      'Sopivat ryhmät: ' +
        selected
          .map(
            (s) => t('dateFormat.weekday', { date: s.date }) + (s.time ? ' ' + t(`registration.time.${s.time}`) : '')
          )
          .join(', '),
    [selected, t]
  )

  return <Tooltip title={title}>{children}</Tooltip>
}

export default GroupColorTooltip
