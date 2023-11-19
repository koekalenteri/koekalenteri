import type { SectionProps } from '../../EventForm'

import { useMemo } from 'react'
import Stack from '@mui/material/Stack'

import { getUniqueEventClasses } from '../../../../../lib/event'

import { ClassGroups } from './eventDates/ClassGroups'

interface Props extends Pick<SectionProps, 'event' | 'onChange'> {}

export const EventDates = ({ event, onChange }: Readonly<Props>) => {
  const classes = useMemo(() => getUniqueEventClasses(event), [event])

  return (
    <Stack gap={1}>
      {classes.map((c) => (
        <ClassGroups key={c} event={event} eventClass={c} onChange={onChange} />
      ))}
    </Stack>
  )
}
