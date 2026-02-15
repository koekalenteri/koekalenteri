import type { RegistrationDate } from '../../../../types'
import Stack from '@mui/material/Stack'
import { useTranslation } from 'react-i18next'
import GroupColors from './GroupColors'

interface Props {
  readonly available: RegistrationDate[]
  readonly group: RegistrationDate
}

const GroupHeader = ({ available, group }: Props) => {
  const { t } = useTranslation()

  return (
    <Stack
      direction="row"
      className={'header'}
      sx={{
        bgcolor: 'background.ok',
        height: 24,
        lineHeight: '24px',
      }}
    >
      <GroupColors available={available} selected={[group]} disableTooltip />
      <b>
        {t('dateFormat.wdshort', { date: group.date }) +
          (group.time ? ` ${t(`registration.timeLong.${group.time}`)}` : '')}
      </b>
    </Stack>
  )
}

export default GroupHeader
