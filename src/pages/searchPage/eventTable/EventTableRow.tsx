import type { PublicDogEvent, RegistrationClass } from '../../../types'

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import Collapse from '@mui/material/Collapse'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { useRecoilState } from 'recoil'

import { isEntryOpen, isEntryUpcoming } from '../../../lib/utils'
import { Path } from '../../../routeConfig'
import LinkButton from '../../components/LinkButton'
import { openedEventAtom } from '../../recoil'

import { EventPlaces } from './eventTableRow/EventPlaces'
import { EventInfo } from './EventInfo'
import { EventStateInfo } from './EventStateInfo'

interface Props {
  readonly event: PublicDogEvent
}

export const EventTableRow = ({ event }: Props) => {
  const [open, setOpen] = useRecoilState(openedEventAtom(event.id))
  const { t } = useTranslation()

  const handleClick = useCallback(() => setOpen(!open), [open, setOpen])
  const classes = useMemo(() => {
    const ret: RegistrationClass[] = []
    for (const c of event.classes) {
      const name = typeof c === 'string' ? c : c.class
      if (ret.indexOf(name) === -1) {
        ret.push(name)
      }
    }
    return ret.join(', ')
  }, [event])

  const infoText = isEntryUpcoming(event)
    ? t('dateFormat.datespan', { start: event.entryStartDate, end: event.entryEndDate })
    : null

  return (
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
          <Grid item container xs onClick={handleClick} spacing={1}>
            <Grid item container xs={12} md={6} justifyContent="flex-start" spacing={1}>
              <Grid item xs={1.5}>
                {t('dateFormat.datespan', { start: event.startDate, end: event.endDate })}
              </Grid>
              <Grid item xs={3}>
                {event.eventType}
              </Grid>
              <Grid item xs={2.2}>
                {classes}
              </Grid>
              <Grid item xs={5.3}>
                {event.location}
                {event.name ? ` (${event.name})` : ''}
              </Grid>
            </Grid>
            <Grid item container xs={12} md={6} spacing={1}>
              <Grid item xs={6} md={7.2}>
                {event.organizer?.name}
              </Grid>
              <Grid item xs={3} md={1.8}>
                <EventPlaces event={event} />
              </Grid>
              <Grid item xs={3} md={3} textAlign="right">
                {isEntryOpen(event) ? (
                  <LinkButton to={Path.register(event)} text={t('register')} />
                ) : (
                  <EventStateInfo id={event.id} state={event.state} text={infoText} />
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
  )
}
