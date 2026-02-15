import type { PublicDogEvent } from '../../../types'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { zonedStartOfDay } from '../../../i18n/dates'
import { isEntryClosed, isEntryOpen, isEntryUpcoming, isEventOver, isValidForEntry } from '../../../lib/utils'
import { Path } from '../../../routeConfig'
import { CollapsibleEvent } from '../../components/CollapsibleEvent'
import LinkButton from '../../components/LinkButton'
import { EventInfo } from './EventInfo'
import { EventStateInfo } from './EventStateInfo'
import { EventPlaces } from './eventTableRow/EventPlaces'

interface Props {
  readonly event: PublicDogEvent
  readonly odd?: boolean
}

const EventHeader = ({ event }: Props) => {
  const { t } = useTranslation()

  const infoText = useMemo(() => {
    if (isEntryOpen(event)) return t('dateFormat.datespan', { end: event.entryEndDate, start: event.entryStartDate })
    if (isEventOver(event)) return t('event.states.confirmed_eventOver')

    if (event.state === 'picked') return t('event.states.picked')

    if (isEntryClosed(event)) return t('event.states.confirmed_entryClosed_info')

    if (event.state !== 'tentative' && isEntryUpcoming(event))
      return (
        <div style={{ position: 'relative' }}>
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{
              bottom: '20px',
              fontSize: '10px',
              lineHeight: '12px',
              position: 'absolute',
              right: 0,
              textAlign: 'right',
            }}
          >
            {t('entryOpens')}
          </Typography>
          {t('dateFormat.date', { date: event.entryStartDate })}
        </div>
      )

    return null
  }, [event, t])

  const showPlaces = useMemo(
    (): boolean =>
      !!event.entryStartDate && zonedStartOfDay(event.entryStartDate) <= new Date() && isValidForEntry(event.state),
    [event]
  )

  return (
    <>
      <Grid container columnSpacing={1} size={12}>
        <Grid overflow={'hidden'} textOverflow={'ellipsis'} sx={{ textWrap: 'nowrap' }} size="grow">
          <Typography variant="caption" color="text.secondary">
            {event.organizer.name}
          </Typography>
        </Grid>
        <Grid display={{ sm: 'block', xs: 'none' }} offset="auto">
          {showPlaces ? <EventPlaces event={event} /> : null}
        </Grid>
      </Grid>
      <Grid
        container
        columnSpacing={1}
        size={{
          sm: 'auto',
          xs: 12,
        }}
      >
        <Grid>{t('dateFormat.datespan', { end: event.endDate, start: event.startDate })}</Grid>
        <Grid
          overflow={'hidden'}
          textOverflow={'ellipsis'}
          sx={{ textWrap: 'nowrap' }}
          size={{
            sm: 'auto',
            xs: 'grow',
          }}
        >
          {event.eventType}
        </Grid>
        <Grid display={{ sm: 'none' }} offset="auto">
          {showPlaces ? <EventPlaces event={event} /> : null}
        </Grid>
      </Grid>
      <Grid
        container
        columnSpacing={1}
        size={{
          sm: 'grow',
          xs: 12,
        }}
      >
        <Grid>{event.location}</Grid>
        <Grid
          overflow={'hidden'}
          textOverflow={'ellipsis'}
          sx={{ textWrap: 'nowrap' }}
          size={{
            sm: 'auto',
            xs: 'grow',
          }}
        >
          {event.name ? event.name : ''}
        </Grid>
        <Grid
          alignContent="center"
          size="auto"
          offset={{
            sm: 'auto',
          }}
        >
          <Typography variant="body2" component="div">
            {isEntryOpen(event) ? (
              <LinkButton to={Path.register(event)} text={t('register')} sx={{ pr: 0 }} />
            ) : (
              <EventStateInfo
                id={event.id}
                state={event.state}
                startListPublished={event.startListPublished}
                text={infoText}
              />
            )}
          </Typography>
        </Grid>
      </Grid>
    </>
  )
}

export const EventListItem = ({ event, odd }: Props) => (
  <CollapsibleEvent eventId={event.id} header={<EventHeader event={event} />} odd={odd}>
    <EventInfo event={event}></EventInfo>
  </CollapsibleEvent>
)
