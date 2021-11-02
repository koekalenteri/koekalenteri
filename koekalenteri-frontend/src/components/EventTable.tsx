import { useState } from 'react';
import {
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Collapse,
  Box,
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { Link } from 'react-router-dom';
import { EventEx } from 'koekalenteri-shared';
import { EventInfo } from './EventInfo';
import { useTranslation } from 'react-i18next';

type EventTableProps = {
  events: Array<EventEx>
}

const useRowStyles = makeStyles({
  root: {
    '& > *': {
      borderBottom: 'unset',
      backgroundColor: '#F2F2F2',
      padding: 4
    },
  },
  inner: {
    '& > *': {
      backgroundColor: '#F2F2F2',
    },
  }
});

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

function Row(props: { event: EventEx }) {
  const { event } = props;
  const [open, setOpen] = useState(false);
  const classes = useRowStyles();
  const { t } = useTranslation();

  return (
    <>
      <TableRow className={classes.root}>
        <TableCell>
          <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>{t('daterange', { start: event.startDate, end: event.endDate })}</TableCell>
        <TableCell>{event.eventType}</TableCell>
        <TableCell>{eventClasses(event)}</TableCell>
        <TableCell>{event.location}</TableCell>
        <TableCell>{event.organizer?.name}</TableCell>
        <TableCell>{event.entries}/{event.places}</TableCell>
        <TableCell>{event.isEntryOpen ? <Link to={`/event/${event.id}`}>{t('register')}</Link> : ''}</TableCell>
      </TableRow>
      <TableRow className={classes.inner}>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
          <Collapse in={open} timeout="auto" unmountOnExit>
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
    <Box sx={{ width: '100%', textAlign: 'center', color: 'red' }}>{t('no_results')}</Box>
  );
}

export function EventTable({ events }: EventTableProps) {
  const { t } = useTranslation();
  return (
    <>
      {events.length ?
        <TableContainer component={Paper}>
          <Table aria-label="event table">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>{t('eventTime')}</TableCell>
                <TableCell>{t('eventType')}</TableCell>
                <TableCell>{t('eventClasses')}</TableCell>
                <TableCell>{t('location')}</TableCell>
                <TableCell>{t('organizer')}</TableCell>
                <TableCell>{t('places')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
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

