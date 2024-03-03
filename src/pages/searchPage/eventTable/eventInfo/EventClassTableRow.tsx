import type { EventClass, PublicDogEvent } from '../../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'

import { judgeName } from '../../../../lib/judge'
import { isEntryOpen } from '../../../../lib/utils'
import { Path } from '../../../../routeConfig'
import LinkButton from '../../../components/LinkButton'

interface Props {
  event: PublicDogEvent
  eventClass: EventClass
}

export const EventClassTableRow = ({ event, eventClass }: Props) => {
  const { t } = useTranslation()

  const date = eventClass.date ?? event.startDate ?? new Date()
  const classDate = t('dateFormat.short', { date })
  const entryStatus = useMemo(() => {
    if (!eventClass.entries && !eventClass.places) return ''

    const entries = eventClass.entries ?? 0
    const places = eventClass.places ? eventClass.places : event.classes.length === 1 ? event.places : '-'
    return `${entries} / ${places}`
  }, [event, eventClass])
  const memberStatus = eventClass.members ? t('members', { count: eventClass.members }) : ''
  const judgeNames = useMemo(
    () =>
      Array.isArray(eventClass.judge)
        ? eventClass.judge.map((j) => judgeName(j, t)).join(', ')
        : judgeName(eventClass.judge, t),
    [eventClass.judge, t]
  )

  return (
    <TableRow>
      <TableCell component="th" scope="row">
        {t('dateFormat.wdshort', { date })}
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
          <LinkButton to={Path.register(event, eventClass.class, classDate)} text={t('register')} />
        ) : null}
      </TableCell>
      <TableCell></TableCell>
    </TableRow>
  )
}
