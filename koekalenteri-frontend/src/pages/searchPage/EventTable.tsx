import { Table, TableBody, TableContainer } from '@mui/material'
import type { Event } from 'koekalenteri-shared/model'

import { EmptyResult } from './eventTable/EmptyResult'
import { EventTableRow } from './eventTable/EventTableRow'

export function EventTable({ events }: { events: Event[] }) {
  if (!events.length) {
    return <EmptyResult />
  }

  return (
    <TableContainer>
      <Table
        aria-label="event table"
        sx={{
          borderCollapse: 'separate',
          borderSpacing: '3px',
        }}
      >
        <TableBody>
          {events.map((event) => (
            <EventTableRow key={event.id} event={event} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
