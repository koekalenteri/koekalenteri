import type { PublicDogEvent, PublicJudge } from '../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'

import { zonedEndOfDay } from '../../../i18n/dates'
import { judgeName } from '../../../lib/judge'
import { isEntryOpen, printContactInfo, unique } from '../../../lib/utils'
import { getRankingPeriod } from '../../../rules_ch'
import CostInfo from '../../components/CostInfo'
import { EntryStatus } from '../../components/EntryStatus'
import { ItemWithCaption } from '../../components/ItemWithCaption'
import { PriorityChips } from '../../components/PriorityChips'
import { TimeLeft } from '../../components/TimeLeft'

import { EventClassPlaces } from './eventInfo/EventClassPlaces'
import { EventClassPlacesHeader } from './eventInfo/EventClassPlacesHeader'

interface Props {
  readonly event: PublicDogEvent
}

const judgeClasses = (judge: PublicJudge, event: PublicDogEvent) => {
  const classes = unique(
    event.classes
      .filter((c) => (Array.isArray(c.judge) ? c.judge.find((j) => j.id === judge.id) : c.judge?.id === judge.id))
      .map((c) => c.class)
  )
  return classes.length ? ` (${classes.join(', ')})` : ''
}

export const EventInfo = ({ event }: Props) => {
  const { t } = useTranslation()
  const official = useMemo(() => printContactInfo(event.contactInfo?.official), [event.contactInfo?.official])
  const secretary = useMemo(() => printContactInfo(event.contactInfo?.secretary), [event.contactInfo?.secretary])
  const classes = useMemo(
    () => (event.classes.length ? unique(event.classes.map((c) => c.class)) : [event.eventType]),
    [event.classes, event.eventType]
  )
  const judges = useMemo(
    () => event.judges.map((j) => `${judgeName(j, t)}${judgeClasses(j, event)}`).filter(Boolean),
    [event, t]
  )
  const rankingPeriod = getRankingPeriod(
    event.eventType,
    event.entryOrigEndDate ?? event.entryEndDate,
    event.qualificationStartDate
  )

  return (
    <Grid container columnSpacing={1} sx={{ py: 0.5 }}>
      <ItemWithCaption label={t('entryTime')} order={{ xs: 1 }}>
        {t('dateFormat.datespan', { start: event.entryStartDate, end: event.entryEndDate })}
        <EntryStatus event={event} />
        {isEntryOpen(event) ? <TimeLeft date={zonedEndOfDay(event.entryEndDate!)} /> : ''}
      </ItemWithCaption>
      {classes.length ? (
        <ItemWithCaption
          label={t('event.classPlaces')}
          order={{ xs: 2, lg: 3, xl: 10 }}
          size={{ xs: 12, md: 6, lg: 4, xl: 'grow' }}
        >
          <EventClassPlacesHeader event={event} />
          {classes.map((c) => (
            <EventClassPlaces key={c} event={event} eventClass={c} />
          ))}
        </ItemWithCaption>
      ) : null}
      {judges.length ? (
        <ItemWithCaption label={t('event.judges')} order={{ xs: 3, lg: 2 }}>
          {judges.map((j) => (
            <Box key={j}>{j}</Box>
          ))}
        </ItemWithCaption>
      ) : null}
      {official ? (
        <ItemWithCaption label={t('event.official')} order={{ xs: 4, lg: 2 }}>
          {official}
        </ItemWithCaption>
      ) : null}
      {secretary ? (
        <ItemWithCaption label={t('event.secretary')} order={{ xs: 5, lg: official ? undefined : 2 }}>
          {secretary}
        </ItemWithCaption>
      ) : null}
      {event.cost ? (
        <ItemWithCaption label={t('paymentDetails')} order={{ xs: 6, xl: 9 }}>
          <CostInfo event={event} />
        </ItemWithCaption>
      ) : null}
      {event.priority?.length ? (
        <ItemWithCaption label={t('event.priority')} order={{ xs: 7 }}>
          <PriorityChips priority={event.priority} />
        </ItemWithCaption>
      ) : null}
      {rankingPeriod ? (
        <ItemWithCaption label={t('registration.rankingTime')} order={{ xs: 8 }}>
          {t('dateFormat.datespan', { start: rankingPeriod.minResultDate, end: rankingPeriod.maxResultDate })}
        </ItemWithCaption>
      ) : null}
      {event.description ? (
        <ItemWithCaption label={t('event.description')} order={{ xs: 9 }}>
          {event.description}
        </ItemWithCaption>
      ) : null}
    </Grid>
  )
}
