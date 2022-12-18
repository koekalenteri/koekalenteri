import { ReactElement, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Stack, Tooltip } from '@mui/material';
import { RegistrationDate } from 'koekalenteri-shared/model';

export const GROUP_COLORS = ['#2D9CDB', '#BB6BD9', '#F2994A', '#27AE60', '#828282', '#56CCF2']

export const availableGroups = (dates: Date[]) => dates.reduce<RegistrationDate[]>((acc, date) => [...acc, { date, time: 'ap' }, { date, time: 'ip' }], [])

interface Props {
  dates: Date[]
  disableTooltip?: boolean
  selected: RegistrationDate[]
}

export const GroupColors = ({ dates, disableTooltip = false, selected }: Props) => {
  const available = availableGroups(dates)
  return (
    <GroupColorTooltip selected={selected} disabled={disableTooltip}>
      <Stack direction="row" spacing={0} sx={{ width: 36, height: '100%' }}>
        {available.map((dt, index) => {
          const color = GROUP_COLORS[index % GROUP_COLORS.length];
          const isSelected = !!selected.find(s => s.date.getTime() === dt.date.getTime() && s.time === dt.time);
          return <Box key={color} sx={{ bgcolor: isSelected ? color : 'transparent', width: 6, height: '100%' }} />
        })}
      </Stack>
    </GroupColorTooltip>
  )
}

interface TooltipProps {
  children: ReactElement
  disabled: boolean
  selected: RegistrationDate[]

}

const GroupColorTooltip = ({ selected, children, disabled }: TooltipProps) => {
  const { t } = useTranslation()
  const title = useMemo(() => selected.length && 'Sopivat ryhmät: ' + selected.map(s =>
    t('weekday', { date: s.date }) + ' ' + t(`registration.time.${s.time}`)).join(', '),
  [selected, t])

  if (disabled) {
    return children
  }

  return <Tooltip title={title}>
    {children}
  </Tooltip>
}
