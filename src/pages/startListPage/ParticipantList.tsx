import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'

import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'

import { CancelledRegistration } from './CancelledRegistration'
import { ClassHeader } from './ClassHeader'
import { DateHeader } from './DateHeader'
import { RegistrationDetails } from './RegistrationDetails'
import { TimeHeader } from './TimeHeader'

interface ParticipantListProps {
  participants: PublicRegistration[]
  event: PublicConfirmedEvent
}

export const ParticipantList = ({ participants, event }: ParticipantListProps) => {
  let lastDate: Date | undefined
  let lastClass: PublicRegistration['class']
  let lastTime: string | undefined
  let index = 0

  return (
    <Table size="small">
      <TableBody>
        {participants.map((reg) => {
          const result: JSX.Element[] = []

          // Add date header if date changed
          if (reg.group.date?.valueOf() !== lastDate?.valueOf()) {
            const date = reg.group.date ?? event?.startDate ?? new Date()
            result.push(<DateHeader key={date.toISOString()} date={date} />)
            lastDate = reg.group.date
            lastTime = undefined
            index = 0
          }

          // Add class header if class changed
          if (lastClass !== reg.class) {
            if (reg.class) {
              result.push(<ClassHeader key={reg.class} classValue={reg.class} event={event} lastDate={lastDate} />)
            }
            lastClass = reg.class
            index = 0
          }

          // Add time header if time changed
          if (lastTime !== reg.group.time) {
            if (reg.group.time) {
              result.push(
                <TimeHeader
                  key={`${lastDate?.toISOString()} ${reg.group.time}`}
                  time={reg.group.time}
                  lastDate={lastDate}
                />
              )
            }
            lastTime = reg.group.time
            index = 0
          }

          // Add registration details
          if (reg.cancelled) {
            result.push(<CancelledRegistration key={`cancelled-${reg.group.number}`} groupNumber={reg.group.number} />)
          } else {
            result.push(<RegistrationDetails key={`reg-${reg.group.number}`} registration={reg} index={index} />)
            index++
          }

          return result
        })}
      </TableBody>
    </Table>
  )
}
