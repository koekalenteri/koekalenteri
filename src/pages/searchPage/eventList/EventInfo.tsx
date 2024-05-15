import type { Grid2Props } from '@mui/material'
import type { ReactNode } from 'react'
import type { PublicDogEvent, PublicJudge } from '../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2/Grid2'
import { endOfDay } from 'date-fns'

import useEventStatus from '../../../hooks/useEventStatus'
import { judgeName } from '../../../lib/judge'
import { isEntryOpen, printContactInfo, unique } from '../../../lib/utils'
import CostInfo from '../../components/CostInfo'
import { PriorityChips } from '../../components/PriorityChips'

import { EventClassInfo } from './eventInfo/EventClassInfo'

interface Props {
  readonly event: PublicDogEvent
}

const InfoItem = ({ label, children, ...props }: { label: string; children: ReactNode } & Grid2Props) => (
  <Grid xs={12} md={6} lg={4} xl={2} {...props}>
    <Typography
      variant="caption"
      color="text.secondary"
      bgcolor="background.form"
      borderRadius="4px"
      sx={{ p: 0.5, ml: -0.5, width: '100%', display: 'block' }}
    >
      {label}
    </Typography>
    {children}
  </Grid>
)

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
  const status = useEventStatus(event)
  const official = useMemo(() => printContactInfo(event.contactInfo?.official), [event.contactInfo?.official])
  const secretary = useMemo(() => printContactInfo(event.contactInfo?.secretary), [event.contactInfo?.secretary])
  const classes = useMemo(
    () => (event.classes.length ? unique(event.classes.map((c) => c.class)) : [event.eventType]),
    [event.classes, event.eventType]
  )
  const judges = useMemo(() => event.judges.map((j) => `${judgeName(j, t)}${judgeClasses(j, event)}`), [event, t])

  return (
    <Grid container columnSpacing={1} disableEqualOverflow sx={{ py: 0.5 }}>
      <InfoItem label={t('entryTime')} order={{ xs: 1 }}>
        {t('dateFormat.datespan', { start: event.entryStartDate, end: event.entryEndDate })}{' '}
        <span className="info">{status}</span>
        {isEntryOpen(event) ? t('dateFormat.distanceLeft', { date: endOfDay(event.entryEndDate!) }) : ''}
      </InfoItem>
      {classes.length ? (
        <InfoItem label={t('event.classPlaces')} order={{ xs: 2, lg: 3, xl: 10 }} xl={true}>
          {classes.map((c) => (
            <EventClassInfo key={c} event={event} eventClass={c} />
          ))}
        </InfoItem>
      ) : null}
      <InfoItem label={t('event.judges')} order={{ xs: 3, lg: 2 }}>
        {judges.map((j) => (
          <Box>{j}</Box>
        ))}
      </InfoItem>
      {official ? (
        <InfoItem label={t('event.official')} order={{ xs: 4, lg: 2 }}>
          {official}
        </InfoItem>
      ) : null}
      {secretary ? (
        <InfoItem label={t('event.secretary')} order={{ xs: 5, lg: official ? undefined : 2 }}>
          {secretary}
        </InfoItem>
      ) : null}
      {event.cost ? (
        <InfoItem label={t('paymentDetails')} order={{ xs: 6, xl: 9 }}>
          <CostInfo event={event} />
        </InfoItem>
      ) : null}
      {event.priority?.length ? (
        <InfoItem label={t('event.priority')} order={{ xs: 7 }}>
          <PriorityChips priority={event.priority} />
        </InfoItem>
      ) : null}
      {event.description ? (
        <InfoItem label={t('event.description')} order={{ xs: 8 }}>
          {event.description}
        </InfoItem>
      ) : null}
    </Grid>
  )
}
