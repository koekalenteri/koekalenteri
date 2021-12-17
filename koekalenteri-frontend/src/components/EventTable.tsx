import { useEffect } from 'react';
import {
  TableContainer,
  Paper,
  Table,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Collapse,
  Box,
  Grid,
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material';
import type { EventEx } from 'koekalenteri-shared/model';
import { EventInfo } from './EventInfo';
import { useTranslation } from 'react-i18next';
import { LinkButton } from './Buttons';
import { useSessionBoolean } from '../stores';

const useRowStyles = makeStyles(theme => ({
  root: {
    '& > td': {
      backgroundColor: theme.palette.background.form,
      borderBottom: '2px solid white',
      borderRadius: 4,
      padding: '2px 0',
      whiteSpace: 'nowrap',
    },
    '& div.MuiGrid-item': {
      overflow: 'hidden'
    },
    '&:last-child td': { border: 0 }
  },
  inner: {
    borderTop: '1px solid #BDBDBD',
    marginLeft: '34px'
  }
}));

function eventClasses(event: EventEx) {
  const ret: string[] = [];
  for (const c of event.classes) {
    const name = typeof c === 'string' ? c : c.class;
    if (ret.indexOf(name) === -1) {
      ret.push(name);
    }
  }
  return ret.join(', ');
}

const placesColor = (event: EventEx) => event.entries > event.places ? 'warning.main' : 'text.primary';

function Row({ event }: { event: EventEx }) {

  const [open, setOpen] = useSessionBoolean('open' + event.id, false);
  const classes = useRowStyles();
  const { t } = useTranslation();

  useEffect(() => {
    sessionStorage.setItem('open' + event.id, JSON.stringify(open));
  }, [event, open])

  return (
    <>
      <TableRow className={classes.root}>
        <TableCell>
          <Grid container spacing={0} alignItems="center">
            <Grid item xs={"auto"}>
              <IconButton aria-label="expand row" size="small" color="primary" onClick={() => setOpen(!open)}>
                {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
              </IconButton>
            </Grid>
            <Grid item container xs onClick={() => setOpen(!open)}>
              <Grid item container xs={12} md={6} justifyContent="flex-start" spacing={1}>
                <Grid item xs={3}>{t('daterange', { start: event.startDate, end: event.endDate })}</Grid>
                <Grid item xs={2}>{event.eventType}</Grid>
                <Grid item xs={2}>{eventClasses(event)}</Grid>
                <Grid item xs={5}>{event.location} ({event.name})</Grid>
              </Grid>
              <Grid item container xs={12} md={6} spacing={1}>
                <Grid item xs={6} md={7}>{event.organizer?.name}</Grid>
                <Grid item xs={3} md={2} textAlign="right" sx={{ color: placesColor(event) }}>
                  {event.entries ? `${event.entries}/${event.places}` : event.places + ' ' + t('toltaPlaces')}
                </Grid>
                <Grid item xs={3} md={3}>{event.isEntryOpen ? <LinkButton to={`/event/${event.eventType}/${event.id}`} text={t('register')} /> : ''}</Grid>
              </Grid>
            </Grid>
          </Grid>
          <Collapse in={open} className={classes.inner} timeout="auto" unmountOnExit sx={{mt: 1, pt: 1}}>
            <EventInfo event={event}></EventInfo>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function EmptyResult() {
  const { t } = useTranslation();
  return (
    <Box sx={{ width: '100%', textAlign: 'center', color: 'red' }}>{t('noResults')}</Box>
  );
}

export function EventTable({ events }: {events: EventEx[]}) {
  return (
    <>
      {events.length ?
        <TableContainer component={Paper}>
          <Table aria-label="event table">
            <TableBody>
              {events.map((event) => (<Row key={event.id} event={event} />))}
            </TableBody>
          </Table>
        </TableContainer>
        : <EmptyResult />
      }
    </>
  )
}

