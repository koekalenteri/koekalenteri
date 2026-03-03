import type { RegistrationClass } from '../../../../../types'
import type { SectionProps } from '../types'
import Stack from '@mui/material/Stack'
import { useMemo } from 'react'
import { getUniqueEventClasses, OFFICIAL_EVENT_TYPES } from '../../../../../lib/event'
import { ClassGroups } from './eventDates/ClassGroups'
import { EventGroups } from './eventDates/EventGroups'

interface Props extends Pick<SectionProps, 'disabled' | 'event' | 'onChange'> {
  readonly eventTypeClasses?: RegistrationClass[]
}

export const EventDates = ({ disabled, event, eventTypeClasses, onChange }: Readonly<Props>) => {
  const classes = useMemo(() => getUniqueEventClasses(event), [event])
  const isOfficial = useMemo(() => OFFICIAL_EVENT_TYPES.includes(event.eventType ?? ''), [event.eventType])

  if (isOfficial ? eventTypeClasses?.length === 0 : event.classes.length === 0) {
    return <EventGroups disabled={disabled} event={event} onChange={onChange} />
  }

  return (
    <Stack gap={1}>
      {classes.map((c) => (
        <ClassGroups key={c} disabled={disabled} event={event} eventClass={c} onChange={onChange} />
      ))}
    </Stack>
  )
}
