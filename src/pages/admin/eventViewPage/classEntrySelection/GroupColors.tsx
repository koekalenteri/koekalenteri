import type { RegistrationDate } from '../../../../types'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { HEADER_HEIGHT } from '../../../../assets/Theme'
import GroupColorTooltip from './groupColors/GroupColorTooltip'

export const GROUP_COLORS = ['#2D9CDB', '#BB6BD9', '#F2994A', '#27AE60', '#828282', '#56CCF2']

export const availableGroups = (dates: Date[]) =>
  dates.reduce<RegistrationDate[]>((acc, date) => [...acc, { date, time: 'ap' }, { date, time: 'ip' }], [])

interface Props {
  readonly available: RegistrationDate[]
  readonly disableTooltip?: boolean
  readonly selected: RegistrationDate[]
}

const GroupColors = ({ available, selected, disableTooltip = false }: Props) => {
  if (disableTooltip) {
    const selIdx = available.findIndex(
      (dt) => selected[0].date.getTime() === dt.date.getTime() && selected[0].time === dt.time
    )
    return (
      <Box
        sx={{
          bgcolor: GROUP_COLORS[selIdx % GROUP_COLORS.length],
          borderTopLeftRadius: '4px',
          height: '100%',
          mr: HEADER_HEIGHT,
          width: 24,
        }}
      />
    )
  }
  return (
    <GroupColorTooltip selected={selected}>
      <Stack direction="row" spacing={0} sx={{ height: '100%', width: 36 }}>
        {available.map((dt, index) => {
          const color = GROUP_COLORS[index % GROUP_COLORS.length]
          const isSelected = selected.some((s) => s.date.getTime() === dt.date.getTime() && s.time === dt.time)
          return <Box key={color} sx={{ bgcolor: isSelected ? color : 'transparent', height: '100%', width: 6 }} />
        })}
      </Stack>
    </GroupColorTooltip>
  )
}

export default GroupColors
