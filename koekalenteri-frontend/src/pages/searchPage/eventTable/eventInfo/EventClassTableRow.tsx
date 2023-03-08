import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TableCell, TableRow } from '@mui/material'
import { format } from 'date-fns'
import { Event, EventClass } from 'koekalenteri-shared/model'

import { isEntryOpen } from '../../../../utils'
import LinkButton from '../../../components/LinkButton'

export const EventClassTableRow = ({ event, eventClass }: { event: Event; eventClass: EventClass }) => {
  const { t } = useTranslation()

  const classDate = format(eventClass.date || event.startDate || new Date(), t('dateFormat.short'))
  const entryStatus =
    eventClass.places || eventClass.entries ? `${eventClass.entries || 0} / ${eventClass.places || '-'}` : ''
  const memberStatus = eventClass.members ? t('members', { count: eventClass.members }) : ''
  const judgeNames = useMemo(
    () => (Array.isArray(eventClass.judge) ? eventClass.judge.map((j) => j.name).join(', ') : eventClass.judge?.name),
    [eventClass.judge]
  )

  return (
    <TableRow>
      <TableCell component="th" scope="row">
        {t('dateshort', { date: eventClass.date })}
      </TableCell>
      <TableCell component="th" scope="row">
        {eventClass.class}
      </TableCell>
      <TableCell component="th" scope="row">
        {judgeNames}
      </TableCell>
      <TableCell component="th" scope="row" align="right">
        {entryStatus}
      </TableCell>
      <TableCell component="th" scope="row" align="right">
        {memberStatus}
      </TableCell>
      <TableCell component="th" scope="row">
        {isEntryOpen(event) ? (
          <LinkButton
            to={`/event/${event.eventType}/${event.id}/${eventClass.class}/${classDate}`}
            text={t('register')}
          />
        ) : null}
      </TableCell>
      <TableCell></TableCell>
    </TableRow>
  )
}
