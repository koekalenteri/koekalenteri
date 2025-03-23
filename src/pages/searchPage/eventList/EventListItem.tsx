import type { PublicDogEvent } from '../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Grid2 from '@mui/material/Grid2'
import Typography from '@mui/material/Typography'

import { zonedStartOfDay } from '../../../i18n/dates'
import { isEntryClosed, isEntryOpen, isEventOver, isValidForEntry } from '../../../lib/utils'
import { Path } from '../../../routeConfig'
import { CollapsibleEvent } from '../../components/CollapsibleEvent'
import LinkButton from '../../components/LinkButton'

import { EventPlaces } from './eventTableRow/EventPlaces'
import { EventInfo } from './EventInfo'
import { EventStateInfo } from './EventStateInfo'

interface Props {
  readonly event: PublicDogEvent
  readonly odd?: boolean
}

const EventHeader = ({ event }: Props) => {
  const { t } = useTranslation()

  const infoText = useMemo(() => {
    if (isEntryOpen(event)) return t('dateFormat.datespan', { start: event.entryStartDate, end: event.entryEndDate })
    if (isEventOver(event)) return t('event.states.confirmed_eventOver')

    if (event.state === 'picked') return t('event.states.picked')

    if (isEntryClosed(event)) return t('event.states.confirmed_entryClosed_info')

    return null
  }, [event, t])

  const showPlaces = useMemo(
    (): boolean =>
      !!event.entryStartDate && zonedStartOfDay(event.entryStartDate) <= new Date() && isValidForEntry(event.state),
    [event]
  )

  return (
    <>
      <Grid2 container columnSpacing={1} size={12}>
        <Grid2 overflow={'hidden'} textOverflow={'ellipsis'} sx={{ textWrap: 'nowrap' }} size="grow">
          <Typography variant="caption" color="text.secondary">
            {event.organizer.name}
          </Typography>
        </Grid2>
        <Grid2 display={{ xs: 'none', sm: 'block' }} offset="auto">
          {showPlaces ? <EventPlaces event={event} /> : null}
        </Grid2>
      </Grid2>
      <Grid2
        container
        columnSpacing={1}
        size={{
          xs: 12,
          sm: 'auto',
        }}
      >
        <Grid2>{t('dateFormat.datespan', { start: event.startDate, end: event.endDate })}</Grid2>
        <Grid2
          overflow={'hidden'}
          textOverflow={'ellipsis'}
          sx={{ textWrap: 'nowrap' }}
          size={{
            xs: 'grow',
            sm: 'auto',
          }}
        >
          {event.eventType}
        </Grid2>
        <Grid2 display={{ sm: 'none' }} offset="auto">
          {showPlaces ? <EventPlaces event={event} /> : null}
        </Grid2>
      </Grid2>
      <Grid2
        container
        size={{
          xs: 12,
          sm: 'grow',
        }}
      >
        <Grid2>{event.location}</Grid2>
        <Grid2
          overflow={'hidden'}
          textOverflow={'ellipsis'}
          sx={{ textWrap: 'nowrap' }}
          size={{
            xs: 'grow',
            sm: 'auto',
          }}
        >
          {event.name ? event.name : ''}
        </Grid2>
        <Grid2
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
        </Grid2>
      </Grid2>
    </>
  )
}

export const EventListItem = ({ event, odd }: Props) => (
  <CollapsibleEvent eventId={event.id} header={<EventHeader event={event} />} odd={odd}>
    <EventInfo event={event}></EventInfo>
  </CollapsibleEvent>
)
