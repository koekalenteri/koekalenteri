import type { DogEvent } from '../../types'

import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableContainer from '@mui/material/TableContainer'

import { EmptyResult } from './eventTable/EmptyResult'
import { EventTableRow } from './eventTable/EventTableRow'

interface Props {
  readonly events: DogEvent[]
}

export function EventTable({ events }: Props) {
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
