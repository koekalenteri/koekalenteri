import { useTranslation } from 'react-i18next'
import { Table, TableBody, TableCell, TableRow } from '@mui/material'
import { format } from 'date-fns'
import type { Event, EventClass } from 'koekalenteri-shared/model'

import useEventStatus from '../../hooks/useEventStatus'
import { isEntryOpen } from '../../utils'
import CostInfo from '../components/CostInfo'
import LinkButton from '../components/LinkButton'
import { useJudgesActions } from '../recoil'

export const EventInfo = ({ event }: { event: Event }) => {
  const { t } = useTranslation()
  const judgeActions = useJudgesActions()
  const status = useEventStatus(event)

  const judgeName = (id: number) => judgeActions.find(id)?.name ?? ''
  const haveJudgesWithoutAssignedClass =
    event.judges.filter(
      (j) =>
        !event.classes.find((c) => (Array.isArray(c.judge) ? c.judge.find((cj) => cj.id === j) : c.judge?.id === j))
    ).length > 0

  return (
    <>
      <Table
        size="small"
        aria-label="details"
        sx={{
          '& *': {
            border: 0,
            padding: '2px 16px 2px 0',
          },
          '& th': {
            width: '1%',
            whiteSpace: 'nowrap',
            verticalAlign: 'top',
          },
          '& td': {
            whiteSpace: 'normal',
          },
        }}
      >
        <TableBody>
          <TableRow key={event.id + 'date'}>
            <TableCell component="th" scope="row">
              {t('entryTime')}:
            </TableCell>
            <TableCell>
              {t('daterange', { start: event.entryStartDate, end: event.entryEndDate })}
              <span className="info">{status}</span>
              {isEntryOpen(event) ? t('distanceLeft', { date: event.entryEndDate }) : ''}
            </TableCell>
          </TableRow>
          {event.classes.length !== 0 && <EventClassRow key={event.id + 'classes'} event={event} />}
          {haveJudgesWithoutAssignedClass && (
            <>
              <TableRow key={event.id + 'judge' + event.judges[0]}>
                <TableCell component="th" scope="row" rowSpan={event.judges.length}>
                  {t('event.judges')}:
                </TableCell>
                <TableCell>{judgeName(event.judges[0])}</TableCell>
              </TableRow>
              {event.judges.slice(1).map((judgeId) => (
                <TableRow key={event.id + 'judge' + judgeId}>
                  <TableCell>{judgeName(judgeId)}</TableCell>
                </TableRow>
              ))}
            </>
          )}
          <TableRow key={event.id + 'official'}>
            <TableCell component="th" scope="row">
              {t('event.official')}:
            </TableCell>
            <TableCell>{event.official?.name || ''}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'payment'}>
            <TableCell component="th" scope="row">
              {t('event.paymentDetails')}:
            </TableCell>
            <TableCell>
              <CostInfo event={event} />
            </TableCell>
          </TableRow>
          {event.description ? (
            <TableRow key={event.id + 'description'}>
              <TableCell component="th" scope="row">
                {t('event.description')}:
              </TableCell>
              <TableCell>{event.description}</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </>
  )
}

type EventProps = {
  event: Event
}

const EventClassRow = ({ event }: EventProps) => {
  const { t } = useTranslation()
  return (
    <TableRow key={event.id + 'classes'}>
      <TableCell component="th" scope="row">
        {t('event.classes')}:
      </TableCell>
      <TableCell>
        <EventClassTable event={event} />
      </TableCell>
    </TableRow>
  )
}

const eventClassKey = (eventId: string, eventClass: string | EventClass) =>
  eventId + 'class' + (typeof eventClass === 'string' ? eventClass : eventClass.date + eventClass.class)

const EventClassTable = ({ event }: EventProps) => {
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

const EventClassTableRow = ({ event, eventClass }: { event: Event; eventClass: EventClass }) => {
  const { t } = useTranslation()
  const classDate = format(eventClass.date || event.startDate || new Date(), t('dateFormat.short'))
  const entryStatus =
    eventClass.places || eventClass.entries ? `${eventClass.entries || 0} / ${eventClass.places || '-'}` : ''
  const memberStatus = eventClass.members ? t('members', { count: eventClass.members }) : ''
  const judgeNames = Array.isArray(eventClass.judge)
    ? eventClass.judge.map((j) => j.name).join(', ')
    : eventClass.judge?.name
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
