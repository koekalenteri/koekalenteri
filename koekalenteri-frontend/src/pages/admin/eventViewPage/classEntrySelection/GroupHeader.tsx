import type { RegistrationDate } from 'koekalenteri-shared/model'

import { useTranslation } from 'react-i18next'
import Stack from '@mui/material/Stack'

import GroupColors from './GroupColors'

interface Props {
  readonly eventDates: Date[]
  readonly group: RegistrationDate
}

const GroupHeader = ({ eventDates, group }: Props) => {
  const { t } = useTranslation()

  return (
    <Stack
      direction="row"
      className={'header'}
      sx={{
        height: 24,
        lineHeight: '24px',
        bgcolor: 'background.ok',
      }}
    >
      <GroupColors dates={eventDates} selected={[group]} disableTooltip />
      <b>
        {t('dateFormat.wdshort', { date: group.date }) + (group.time ? ' ' + t(`registration.time.${group.time}`) : '')}
      </b>
    </Stack>
  )
}

export default GroupHeader
