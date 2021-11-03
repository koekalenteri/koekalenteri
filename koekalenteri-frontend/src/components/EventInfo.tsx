import { Table, TableBody, TableRow, TableCell, Box } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { Event } from "koekalenteri-shared";
import { useTranslation } from 'react-i18next';

const useRowStyles = makeStyles({
  root: {
    '& > *': {
      borderBottom: 'unset',
      backgroundColor: '#F2F2F2',
      padding: 4
    },
  },
});

export function EventInfo(props: { event: Event }) {
  const { event } = props;
  const classes = useRowStyles();
  const { t } = useTranslation();
  return (
    <Box margin={1}>
      <Table size="small" aria-label="details">
        <TableBody>
          <TableRow key={event.id + 'date'} className={classes.root}>
            <TableCell component="th" scope="row">{t('event.entryTime')}</TableCell>
            <TableCell>{t('daterange', { start: event.entryStartDate, end: event.entryEndDate })}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'judge' + event.judges[0]} className={classes.root}>
            <TableCell component="th" scope="row" rowSpan={event.judges.length}>{t('event.judges')}</TableCell>
            <TableCell>{event.judges[0]}</TableCell>
          </TableRow>
          {event.judges.slice(1).map((judge) => (
            // TODO: tuomarit ja luokat, päivät, ilmoittautumiset ja paikat pitää linkittää
            <TableRow key={event.id + 'judge' + judge} className={classes.root}><TableCell>{judge}</TableCell></TableRow>
          ))}
          <TableRow key={event.id + 'official'} className={classes.root}>
            <TableCell component="th" scope="row">{t('event.official')}</TableCell>
            <TableCell>{event.official}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'payment'} className={classes.root}>
            <TableCell component="th" scope="row">{t('event.paymentDetails')}</TableCell>
            <TableCell>{event.paymentDetails}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'description'} className={classes.root}>
            <TableCell component="th" scope="row">{t('event.description')}</TableCell>
            <TableCell>{event.description}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
}
