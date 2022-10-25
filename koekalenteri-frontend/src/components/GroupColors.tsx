import { Box } from '@mui/material';
import { RegistrationDate } from 'koekalenteri-shared/model';

export const GROUP_COLORS = ['#2D9CDB', '#BB6BD9', '#F2994A', '#27AE60', '#828282', '#56CCF2'];

export const GroupColors = ({ dates, selected }: { dates: Date[]; selected: RegistrationDate[]; }) => {
  const available = dates.reduce<RegistrationDate[]>((acc, date) => [...acc, { date, time: 'ap' }, { date, time: 'ip' }], []);
  return <>{available.map((dt, index) => {
    const color = GROUP_COLORS[index % GROUP_COLORS.length];
    const isSelected = !!selected.find(s => s.date.getTime() === dt.date.getTime() && s.time === dt.time);
    return <Box key={color} sx={{ bgcolor: isSelected ? color : 'transparent', width: '6px', height: '100%' }} />;
  })}</>;
};
