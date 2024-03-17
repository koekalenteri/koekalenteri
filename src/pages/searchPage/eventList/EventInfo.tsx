import type { Grid2Props } from '@mui/material'
import type { ReactNode } from 'react'
import type { EventClass, PublicDogEvent } from '../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2/Grid2'
import { endOfDay } from 'date-fns'

import useEventStatus from '../../../hooks/useEventStatus'
import { judgeName } from '../../../lib/judge'
import { isEntryOpen, printContactInfo } from '../../../lib/utils'
import { Path } from '../../../routeConfig'
import CostInfo from '../../components/CostInfo'
import LinkButton from '../../components/LinkButton'
import { PriorityChips } from '../../components/PriorityChips'

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

const EventClassInfo = ({
  event,
  eventClass,
  odd,
}: {
  event: PublicDogEvent
  eventClass: EventClass
  odd?: boolean
}) => {
  const { t } = useTranslation()

  const date = eventClass.date ?? event.startDate ?? new Date()
  const classDate = t('dateFormat.short', { date })
  const entryStatus = useMemo(() => {
    if (!eventClass.entries && !eventClass.places && !isEntryOpen(event)) return ''

    const entries = eventClass.entries ?? 0

    if (eventClass.places) {
      return `${entries} / ${eventClass.places}`
    }

    const places = event.classes.length === 1 ? event.places : '-'

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
    <Grid container columnSpacing={{ xs: 1, sm: 2 }}>
      <Grid>{t('dateFormat.wdshort', { date })}</Grid>
      <Grid>{eventClass.class}</Grid>
      <Grid xs={true} overflow={'hidden'} textOverflow={'ellipsis'} sx={{ textWrap: 'nowrap' }}>
        {judgeNames}
      </Grid>
      <Grid>{entryStatus}</Grid>
      <Grid>{memberStatus}</Grid>
      {isEntryOpen(event) ? (
        <Grid>
          <LinkButton
            to={Path.register(event, eventClass.class, classDate)}
            text={t('register')}
            sx={{ display: 'inline', pr: 0 }}
          />
        </Grid>
      ) : null}
    </Grid>
  )
}

const findJudgesWithoutClass = (classes: PublicDogEvent['classes'], judges: PublicDogEvent['judges']) =>
  judges.filter(
    (j) =>
      j?.name &&
      !classes.find((c) => (Array.isArray(c.judge) ? c.judge.find((cj) => cj.id === j.id) : c.judge?.id === j.id))
  )

export const EventInfo = ({ event }: Props) => {
  const { t } = useTranslation()
  const status = useEventStatus(event)

  const showJudges = useMemo(
    () => findJudgesWithoutClass(event.classes, event.judges).length > 0,
    [event.classes, event.judges]
  )

  const official = useMemo(() => printContactInfo(event.contactInfo?.official), [event.contactInfo?.official])
  const secretary = useMemo(() => printContactInfo(event.contactInfo?.secretary), [event.contactInfo?.secretary])

  return (
    <Grid container columnSpacing={1} disableEqualOverflow sx={{ py: 0.5 }}>
      <InfoItem label={t('entryTime')} order={{ xs: 1 }}>
        {t('dateFormat.datespan', { start: event.entryStartDate, end: event.entryEndDate })}{' '}
        <span className="info">{status}</span>
        {isEntryOpen(event) ? t('dateFormat.distanceLeft', { date: endOfDay(event.entryEndDate!) }) : ''}
      </InfoItem>
      {event.classes.length ? (
        <InfoItem label={t('event.classes')} order={{ xs: 2, lg: 3, xl: 10 }} xl={true}>
          {event.classes.map((c, i) => (
            <EventClassInfo key={`${c.date}${c.class}`} event={event} eventClass={c} odd={i % 2 === 0} />
          ))}
        </InfoItem>
      ) : null}
      {showJudges ? (
        <InfoItem label={t('event.judges')} order={{ xs: 3, lg: 2 }}>
          {event.judges.map((judge) => judgeName(judge, t)).join(', ')}
        </InfoItem>
      ) : null}
      {official ? (
        <InfoItem label={t('event.official')} order={{ xs: 4, lg: showJudges ? undefined : 2 }}>
          {official}
        </InfoItem>
      ) : null}
      {secretary ? (
        <InfoItem label={t('event.secretary')} order={{ xs: 5, lg: showJudges || official ? undefined : 2 }}>
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
