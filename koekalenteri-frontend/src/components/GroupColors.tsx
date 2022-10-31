import { Box, Stack, Tooltip } from '@mui/material';
import { RegistrationDate } from 'koekalenteri-shared/model';
import { ReactElement, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const GROUP_COLORS = ['#2D9CDB', '#BB6BD9', '#F2994A', '#27AE60', '#828282', '#56CCF2'];

export const GroupColors = ({ dates, selected }: { dates: Date[]; selected: RegistrationDate[]; }) => {
  const available = dates.reduce<RegistrationDate[]>((acc, date) => [...acc, { date, time: 'ap' }, { date, time: 'ip' }], [])
  return (
    <GroupColorTooltip selected={selected}>
      <Stack direction="row" spacing={0} sx={{ width: 36, height: "100%" }}>
        {available.map((dt, index) => {
          const color = GROUP_COLORS[index % GROUP_COLORS.length];
          const isSelected = !!selected.find(s => s.date.getTime() === dt.date.getTime() && s.time === dt.time);
          return <Box key={color} sx={{ bgcolor: isSelected ? color : 'transparent', width: 6, height: '100%' }} />
        })}
      </Stack>
    </GroupColorTooltip>
  )
}

const GroupColorTooltip = ({ selected, children }: { selected: RegistrationDate[], children: ReactElement}) => {
  const { t } = useTranslation()
  const title = useMemo(() => selected.length && 'Sopivat ryhmät: ' + selected.map(s =>
    t('weekday', { date: s.date }) + ' ' + t(`registration.time.${s.time}`)).join(', '),
  [selected, t])

  return <Tooltip title={title}>
    {children}
  </Tooltip>

}

