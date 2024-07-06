import type { PublicDogEvent } from '../../../types'

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2'
import { startOfDay } from 'date-fns'
import { useRecoilState } from 'recoil'

import { isEntryClosed, isEntryOpen, isEventOver, isValidForEntry } from '../../../lib/utils'
import { Path } from '../../../routeConfig'
import LinkButton from '../../components/LinkButton'
import { openedEventAtom } from '../../recoil'

import { EventPlaces } from './eventTableRow/EventPlaces'
import { EventInfo } from './EventInfo'
import { EventStateInfo } from './EventStateInfo'

interface Props {
  readonly event: PublicDogEvent
  readonly odd?: boolean
}

export const EventListItem = ({ event, odd }: Props) => {
  const [open, setOpen] = useRecoilState(openedEventAtom(event.id))
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
      !!event.entryStartDate && startOfDay(event.entryStartDate) <= new Date() && isValidForEntry(event.state),
    [event]
  )

  const handleClick = useCallback(() => setOpen(!open), [open, setOpen])

  return (
    <Box
      sx={{
        borderBottom: '2px solid',
        borderColor: 'background.hover',
        py: 1,
        pr: 1,
        bgcolor: odd ? 'background.oddRow' : 'background.default',
        overflow: 'hidden',
      }}
      component="article"
    >
      <Grid container spacing={0} alignItems="start" disableEqualOverflow role="heading" aria-level={2}>
        <Grid>
          <IconButton aria-label="expand row" size="small" color="primary" onClick={handleClick}>
            {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
          </IconButton>
        </Grid>
        <Grid container xs onClick={handleClick} spacing={0} columnSpacing={1}>
          <Grid container xs={12} columnSpacing={1}>
            <Grid xs={true} overflow={'hidden'} textOverflow={'ellipsis'} sx={{ textWrap: 'nowrap' }}>
              <Typography variant="caption" color="text.secondary">
                {event.organizer.name}
              </Typography>
            </Grid>
            <Grid xsOffset={'auto'} display={{ xs: 'none', sm: 'block' }}>
              {showPlaces ? <EventPlaces event={event} /> : null}
            </Grid>
          </Grid>
          <Grid container xs={12} sm="auto" columnSpacing={1}>
            <Grid>{t('dateFormat.datespan', { start: event.startDate, end: event.endDate })}</Grid>
            <Grid xs={true} sm="auto" overflow={'hidden'} textOverflow={'ellipsis'} sx={{ textWrap: 'nowrap' }}>
              {event.eventType}
            </Grid>
            <Grid xsOffset={'auto'} display={{ sm: 'none' }}>
              {showPlaces ? <EventPlaces event={event} /> : null}
            </Grid>
          </Grid>
          <Grid container xs={12} sm>
            <Grid>{event.location}</Grid>
            <Grid xs={true} sm="auto" overflow={'hidden'} textOverflow={'ellipsis'} sx={{ textWrap: 'nowrap' }}>
              {event.name ? event.name : ''}
            </Grid>
            <Grid xs="auto" smOffset="auto" alignContent="center">
              <Typography variant="body2" component="div">
                {isEntryOpen(event) ? (
                  <LinkButton to={Path.register(event)} text={t('register')} sx={{ pr: 0 }} />
                ) : (
                  <EventStateInfo id={event.id} state={event.state} text={infoText} />
                )}
              </Typography>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
      <Collapse
        in={open}
        sx={{
          borderTop: '1px solid',
          borderTopColor: 'divider',
          ml: '34px',
          mt: 0,
        }}
        timeout="auto"
        role="region"
      >
        <EventInfo event={event}></EventInfo>
      </Collapse>
    </Box>
  )
}
