import type { RegistrationClass } from '../../../../../types'
import type { SectionProps } from '../../EventForm'

import { useMemo } from 'react'
import Stack from '@mui/material/Stack'

import { getUniqueEventClasses } from '../../../../../lib/event'
import { OFFICIAL_EVENT_TYPES } from '../validation'

import { ClassGroups } from './eventDates/ClassGroups'
import { EventGroups } from './eventDates/EventGroups'

interface Props extends Pick<SectionProps, 'event' | 'onChange'> {
  readonly eventTypeClasses?: RegistrationClass[]
}

export const EventDates = ({ event, eventTypeClasses, onChange }: Readonly<Props>) => {
  const classes = useMemo(() => getUniqueEventClasses(event), [event])
  const isOfficial = useMemo(() => OFFICIAL_EVENT_TYPES.includes(event.eventType ?? ''), [event.eventType])

  if (isOfficial ? eventTypeClasses?.length === 0 : event.classes.length === 0) {
    return <EventGroups event={event} onChange={onChange} />
  }

  return (
    <Stack gap={1}>
      {classes.map((c) => (
        <ClassGroups key={c} event={event} eventClass={c} onChange={onChange} />
      ))}
    </Stack>
  )
}
