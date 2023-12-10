import type { PublicDogEvent } from '../../../types'

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'

import useEventStatus from '../../../hooks/useEventStatus'
import { isEntryOpen, printContactInfo } from '../../../lib/utils'
import CostInfo from '../../components/CostInfo'
import { PriorityChips } from '../../components/PriorityChips'
import { useJudgesActions } from '../../recoil'

import { EventClassRow } from './eventInfo/EventClassRow'

interface Props {
  readonly event: PublicDogEvent
}

export const EventInfo = ({ event }: Props) => {
  const { t } = useTranslation()
  const judgeActions = useJudgesActions()
  const status = useEventStatus(event)

  const judgeName = useCallback((id: number) => judgeActions.find(id)?.name ?? '', [judgeActions])
  const haveJudgesWithoutAssignedClass = useMemo(
    () =>
      event.judges.filter(
        (j) =>
          !event.classes.find((c) => (Array.isArray(c.judge) ? c.judge.find((cj) => cj.id === j) : c.judge?.id === j))
      ).length > 0,
    [event.classes, event.judges]
  )

  return (
    <Table
      size="small"
      aria-label="details"
      sx={{
        border: 0,
        my: 0.5,
        mx: 0,
        '& *': {
          border: 0,
          my: 0,
          borderSpacing: 0,
          padding: '2px 16px 2px 0',
        },
        '& th': {
          border: 0,
          margin: 0,
          py: 0,
          pl: 0,
          borderSpacing: 0,
          width: '1%',
          whiteSpace: 'nowrap',
          verticalAlign: 'top',
        },
        '& td': {
          border: 0,
          margin: 0,
          py: 0,
          pl: 0,
          borderSpacing: 0,
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
            {isEntryOpen(event) ? t('dateFormat.distanceLeft', { date: event.entryEndDate }) : ''}
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
        {event.contactInfo?.official ? (
          <TableRow key={event.id + 'official'}>
            <TableCell component="th" scope="row">
              {t('event.official')}:
            </TableCell>
            <TableCell>{printContactInfo(event.contactInfo?.official)}</TableCell>
          </TableRow>
        ) : null}
        {event.contactInfo?.secretary ? (
          <TableRow key={event.id + 'secretary'}>
            <TableCell component="th" scope="row">
              {t('event.secretary')}:
            </TableCell>
            <TableCell>{printContactInfo(event.contactInfo?.secretary)}</TableCell>
          </TableRow>
        ) : null}
        <TableRow key={event.id + 'payment'}>
          <TableCell component="th" scope="row">
            {t('paymentDetails')}:
          </TableCell>
          <TableCell>
            <CostInfo event={event} />
          </TableCell>
        </TableRow>
        {event.priority?.length ? (
          <TableRow key={event.id + 'priority'}>
            <TableCell component="th" scope="row">
              {t('event.priority')}:
            </TableCell>
            <TableCell>
              <PriorityChips priority={event.priority} />
            </TableCell>
          </TableRow>
        ) : null}
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
  )
}
