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
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { Link } from 'react-router-dom';
import { EventEx } from 'koekalenteri-shared';
import EventInfo from './EventInfo';
import { dateSpan } from './utils';

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

function Row(props: { event: EventEx }) {
  const { event } = props;
  const [open, setOpen] = useState(false);
  const classes = useRowStyles();

  return (
    <>
      <TableRow className={classes.root}>
        <TableCell>
          <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>{dateSpan(event.startDate, event.endDate)}</TableCell>
        <TableCell>{event.eventType}</TableCell>
        <TableCell>{event.classes?.join(', ')}</TableCell>
        <TableCell>{event.location}</TableCell>
        <TableCell>{event.organizer}</TableCell>
        <TableCell>{event.entries}/{event.places}</TableCell>
        <TableCell>{event.isEntryOpen ? <Link to={`/event/${event.id}`}>Ilmoittaudu</Link> : ''}</TableCell>
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

export default function EventTable({ events }: EventTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table aria-label="event table">
        <TableHead style={{ display: 'none' }}>
          <TableRow>
            <TableCell />
            <TableCell>Ajankohta</TableCell>
            <TableCell>Tyyppi</TableCell>
            <TableCell>Luokat</TableCell>
            <TableCell>Sijainti</TableCell>
            <TableCell>Järjestäjä</TableCell>
            <TableCell>Paikkoja</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {events.map((event) => (
            <Row key={event.id} event={event} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

