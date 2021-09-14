import { FunctionComponent, Fragment, useState } from 'react';
import { TableContainer, Paper, Table, TableHead, TableBody, TableRow, TableCell, makeStyles, IconButton, Collapse, Box } from '@material-ui/core';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@material-ui/icons/KeyboardArrowUp';
import { Event } from "koekalenteri-shared/model/Event";

type EventTableProps = {
  events: Array<Event>
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

const dateSpan = (start: Date, end: Date) => start === end ? start : `${start}-${end}`;

function Row(props: { event: Event }) {
  const { event } = props;
  const [open, setOpen] = useState(false);
  const classes = useRowStyles();

  return (
    <Fragment>
      <TableRow className={classes.root}>
        <TableCell>
          <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>{dateSpan(event.startDate, event.endDate)}</TableCell>
        <TableCell>{event.eventType}</TableCell>
        <TableCell>{event.classes}</TableCell>
        <TableCell>{event.location}</TableCell>
        <TableCell>{event.organizer}</TableCell>
        <TableCell>{event.entries}/{event.places}</TableCell>
        <TableCell>Ilmoittaudu</TableCell>
      </TableRow>
      <TableRow className={classes.inner}>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box margin={1}>
              <Table size="small" aria-label="details">
                <TableBody>
                  <TableRow className={classes.root}>
                    <TableCell component="th" scope="row">Ilmoittautumisaika:</TableCell>
                    <TableCell>{dateSpan(event.entryStartDate, event.entryEndDate)}</TableCell>
                  </TableRow>
                  <TableRow className={classes.root}>
                    <TableCell component="th" scope="row" rowSpan={event.judges.length}>Tuomarit:</TableCell>
                    <TableCell>{event.judges[0]}</TableCell>
                  </TableRow>
                  {event.judges.slice(1).map((judge) => (
                    // TODO: tuomarit ja luokat, päivät, ilmoittautumiset ja paikat pitää linkittää
                    <TableRow className={classes.root}><TableCell>{judge}</TableCell></TableRow>
                  ))}
                  <TableRow className={classes.root}>
                    <TableCell component="th" scope="row">Maksutiedot:</TableCell>
                    <TableCell>{event.paymentDetails}</TableCell>
                  </TableRow>
                  <TableRow className={classes.root}>
                    <TableCell component="th" scope="row">Lisätiedot:</TableCell>
                    <TableCell>{event.description}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

const EventTable: FunctionComponent<EventTableProps> = ({events}) => {

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

export default EventTable;
