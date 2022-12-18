import { useTranslation } from 'react-i18next';
import { Stack } from '@mui/material';
import { RegistrationDate } from 'koekalenteri-shared/model';

import GroupColors from './GroupColors'

interface Props {
  eventDates: Date[];
  group: RegistrationDate;
}

const GroupHeader = ({ eventDates, group }: Props) => {
  const { t } = useTranslation();

  return <Stack direction="row" sx={{
    height: 24,
    lineHeight: '24px',
    bgcolor: 'secondary.main'
  }}>
    <GroupColors dates={eventDates} selected={[group]} disableTooltip />
    <b>{t('dateshort', { date: group.date }) + ' ' + t(`registration.time.${group.time}`)}</b>
  </Stack>;
};

export default GroupHeader
