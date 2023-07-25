import type { Event, EventClass } from 'koekalenteri-shared/model'

import { useCallback } from 'react'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'

import { EventClassTableRow } from './EventClassTableRow'

interface Props {
  event: Event
}

export const EventClassTable = ({ event }: Props) => {
  const eventClassKey = useCallback(
    (eventId: string, eventClass: string | EventClass) =>
      eventId + 'class' + (typeof eventClass === 'string' ? eventClass : eventClass.date + eventClass.class),
    []
  )

  return (
    <Table
      size="small"
      sx={{
        '& *': {
          border: 0,
        },
        '& th': {
          padding: '0 8px 0 0',
          verticalAlign: 'middle',
        },
      }}
    >
      <TableBody>
        {event.classes.map((eventClass) => (
          <EventClassTableRow key={eventClassKey(event.id, eventClass)} event={event} eventClass={eventClass} />
        ))}
      </TableBody>
    </Table>
  )
}
