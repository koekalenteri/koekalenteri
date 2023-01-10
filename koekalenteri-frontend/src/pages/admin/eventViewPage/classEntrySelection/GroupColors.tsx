import React, { useMemo } from 'react'
import { Box, Stack } from '@mui/material'
import { RegistrationDate } from 'koekalenteri-shared/model'

import GroupColorTooltip from './groupColors/GroupColorTooltip'

export const GROUP_COLORS = ['#2D9CDB', '#BB6BD9', '#F2994A', '#27AE60', '#828282', '#56CCF2']

export const availableGroups = (dates: Date[]) => dates.reduce<RegistrationDate[]>((acc, date) => [...acc, { date, time: 'ap' }, { date, time: 'ip' }], [])

interface Props {
  dates: Date[]
  disableTooltip?: boolean
  selected: RegistrationDate[]
}

const GroupColors = ({ dates, disableTooltip = false, selected }: Props) => {
  const available = useMemo(() => availableGroups(dates), [dates])
  return (
    <GroupColorTooltip selected={selected} disabled={disableTooltip}>
      <Stack direction="row" spacing={0} sx={{ width: 36, height: '100%' }}>
        {available.map((dt, index) => {
          const color = GROUP_COLORS[index % GROUP_COLORS.length]
          const isSelected = !!selected.find(s => s.date.getTime() === dt.date.getTime() && s.time === dt.time)
          return <Box key={color} sx={{ bgcolor: isSelected ? color : 'transparent', width: 6, height: '100%' }} />
        })}
      </Stack>
    </GroupColorTooltip>
  )
}

export default GroupColors
