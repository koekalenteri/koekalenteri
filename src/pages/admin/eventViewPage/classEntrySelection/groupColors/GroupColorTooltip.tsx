import type { ReactElement } from 'react'
import type { RegistrationDate } from '../../../../../types'
import Tooltip from '@mui/material/Tooltip'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

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
          .map((s) => {
            const timeText = s.time ? t(`registration.time.${s.time}`) : ''
            return t('dateFormat.weekday', { date: s.date }) + (timeText ? ` ${timeText}` : '')
          })
          .join(', '),
    [selected, t]
  )

  return <Tooltip title={title}>{children}</Tooltip>
}

export default GroupColorTooltip
