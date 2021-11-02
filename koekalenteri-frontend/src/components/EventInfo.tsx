import { Table, TableBody, TableRow, TableCell, Box } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { Event } from "koekalenteri-shared";
import { dateSpan } from './utils';

const useRowStyles = makeStyles({
  root: {
    '& > *': {
      borderBottom: 'unset',
      backgroundColor: '#F2F2F2',
      padding: 4
    },
  },
});

export default function EventInfo(props: { event: Event }) {
  const { event } = props;
  const classes = useRowStyles();
  return (
    <Box margin={1}>
      <Table size="small" aria-label="details">
        <TableBody>
          <TableRow key={event.id + 'date'} className={classes.root}>
            <TableCell component="th" scope="row">Ilmoittautumisaika:</TableCell>
            <TableCell>{dateSpan(event.entryStartDate, event.entryEndDate)}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'judge' + event.judges[0]} className={classes.root}>
            <TableCell component="th" scope="row" rowSpan={event.judges.length}>Tuomarit:</TableCell>
            <TableCell>{event.judges[0]}</TableCell>
          </TableRow>
          {event.judges.slice(1).map((judge) => (
            // TODO: tuomarit ja luokat, päivät, ilmoittautumiset ja paikat pitää linkittää
            <TableRow key={event.id + 'judge' + judge} className={classes.root}><TableCell>{judge}</TableCell></TableRow>
          ))}
          <TableRow key={event.id + 'official'} className={classes.root}>
            <TableCell component="th" scope="row">Vastaava koetoimitsija:</TableCell>
            <TableCell>{event.official}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'payment'} className={classes.root}>
            <TableCell component="th" scope="row">Maksutiedot:</TableCell>
            <TableCell>{event.paymentDetails}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'description'} className={classes.root}>
            <TableCell component="th" scope="row">Lisätiedot:</TableCell>
            <TableCell>{event.description}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
}
