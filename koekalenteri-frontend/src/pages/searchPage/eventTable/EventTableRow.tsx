import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material'
import { Collapse, Grid, IconButton, TableCell, TableRow } from '@mui/material'
import { Event } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { isEntryOpen } from '../../../utils'
import LinkButton from '../../components/LinkButton'
import { openedEventAtom } from '../../recoil'

import { EventPlaces } from './eventTableRow/EventPlaces'
import { EventInfo } from './EventInfo'
import { EventStateInfo } from './EventStateInfo'

export const EventTableRow = ({ event }: { event: Event }) => {
  const [open, setOpen] = useRecoilState(openedEventAtom(event.id))
  const { t } = useTranslation()

  const handleClick = useCallback(() => setOpen(!open), [open, setOpen])
  const classes = useMemo(() => {
    const ret: string[] = []
    for (const c of event.classes) {
      const name = typeof c === 'string' ? c : c.class
      if (ret.indexOf(name) === -1) {
        ret.push(name)
      }
    }
    return ret.join(', ')
  }, [event])

  return (
    <>
      <TableRow
        sx={{
          '& > td': {
            backgroundColor: 'background.form',
            borderRadius: '4px',
            padding: 0,
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
                <Grid item xs={3}>
                  {t('daterange', { start: event.startDate, end: event.endDate })}
                </Grid>
                <Grid item xs={2}>
                  {event.eventType}
                </Grid>
                <Grid item xs={2}>
                  {classes}
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
              borderTop: '1px solid',
              borderTopColor: 'divider',
              ml: '34px',
              mt: 0,
            }}
            timeout="auto"
          >
            <EventInfo event={event}></EventInfo>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}