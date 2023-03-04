import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material'
import {
  Box,
  Collapse,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
} from '@mui/material'
import type { Event, EventState } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { isEntryOpen } from '../../utils'
import LinkButton from '../components/LinkButton'
import { openedEventAtom } from '../recoil'

import { EventInfo } from './EventInfo'

function eventClasses(event: Event) {
  const ret: string[] = []
  for (const c of event.classes) {
    const name = typeof c === 'string' ? c : c.class
    if (ret.indexOf(name) === -1) {
      ret.push(name)
    }
  }
  return ret.join(', ')
}

const Row = ({ event }: { event: Event }) => {
  const [open, setOpen] = useRecoilState(openedEventAtom(event.id))
  const { t } = useTranslation()

  const handleClick = useCallback(() => setOpen(!open), [open, setOpen])

  return (
    <>
      <TableRow
        sx={{
          '& > td': {
            backgroundColor: 'background.form',
            borderBottom: '2px solid white',
            borderRadius: 4,
            padding: '2px 0',
            whiteSpace: 'nowrap',
          },
          '& div.MuiGrid-item': {
            overflow: 'hidden',
          },
          '&:last-child td': { border: 0 },
        }}
      >
        <TableCell>
          <Grid container spacing={0} alignItems="center">
            <Grid item xs={'auto'}>
              <IconButton aria-label="expand row" size="small" color="primary" onClick={handleClick}>
                {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
              </IconButton>
            </Grid>
            <Grid item container xs onClick={handleClick}>
              <Grid item container xs={12} md={6} justifyContent="flex-start" spacing={1}>
                <Grid item xs={3} sx={{ fontWeight: event.entryOrigEndDate ? 'bold' : 'normal' }}>
                  {t('daterange', { start: event.startDate, end: event.endDate })}
                </Grid>
                <Grid item xs={2}>
                  {event.eventType}
                </Grid>
                <Grid item xs={2}>
                  {eventClasses(event)}
                </Grid>
                <Grid item xs={5}>
                  {event.location}
                  {event.name ? ` (${event.name})` : ''}
                </Grid>
              </Grid>
              <Grid item container xs={12} md={6} spacing={1}>
                <Grid item xs={6} md={7}>
                  {event.organizer?.name}
                </Grid>
                <Grid item xs={3} md={2}>
                  <EventPlaces event={event} />
                </Grid>
                <Grid item xs={3} md={3} textAlign="right">
                  {isEntryOpen(event) ? (
                    <LinkButton to={`/event/${event.eventType}/${event.id}`} text={t('register')} />
                  ) : (
                    <EventStateInfo state={event.state} />
                  )}
                </Grid>
              </Grid>
            </Grid>
          </Grid>
          <Collapse
            in={open}
            sx={{
              borderTop: '1px solid #BDBDBD',
              ml: '34px',
              mt: 1,
              pt: 1,
            }}
            timeout="auto"
            unmountOnExit
          >
            <EventInfo event={event}></EventInfo>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

const EventPlaces = ({ event }: { event: Event }) => {
  const { t } = useTranslation()
  const color = (event.entries ?? 0) > event.places ? 'warning.main' : 'text.primary'
  let text = ''
  let bold = false
  if (event.places) {
    if (event.entries) {
      text = `${event.entries} / ${event.places}`
      bold = true
    } else {
      text = event.places + ' ' + t('toltaPlaces')
    }
  }
  return (
    <Box textAlign="right" sx={{ color, fontWeight: bold ? 'bold' : 'normal' }}>
      {text}
    </Box>
  )
}

function EventStateInfo({ state }: { state: EventState }) {
  const { t } = useTranslation()
  const showInfo = state === 'tentative' || state === 'cancelled'
  return (
    <Box sx={{ color: 'warning.main', textTransform: 'uppercase', mr: 1 }}>
      {showInfo && t(`event.states.${state}_info`)}
    </Box>
  )
}

function EmptyResult() {
  const { t } = useTranslation()
  return <Box sx={{ width: '100%', textAlign: 'center', color: 'red' }}>{t('noResults')}</Box>
}

export function EventTable({ events }: { events: Event[] }) {
  return (
    <>
      {events.length ? (
        <TableContainer component={Paper}>
          <Table aria-label="event table">
            <TableBody>
              {events.map((event) => (
                <Row key={event.id} event={event} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <EmptyResult />
      )}
    </>
  )
}
