import { useTranslation } from 'react-i18next'
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import { format } from 'date-fns'
import { Event } from 'koekalenteri-shared/model'


interface Props {
  event: Event
}

const InfoPanel = ({ event }: Props) => {
  const { t } = useTranslation()
  return (
    <TableContainer component={Paper} elevation={4} sx={{
      width: 256,
      backgroundColor: 'background.selected',
      p: 1,
      '& .MuiTableCell-root': { py: 0, px: 1 },
    }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell colSpan={5}><b>Ilmoittautuneita</b></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {event.classes?.map(c => <TableRow key={c.class + c.date?.toISOString()}>
            <TableCell>{format(c.date || event.startDate || new Date(), t('dateFormat.short'))}</TableCell>
            <TableCell>{c.class}</TableCell>
            <TableCell align="right">{c.entries}</TableCell>
            <TableCell>Jäseniä</TableCell>
            <TableCell align="right">{c.members}</TableCell>
          </TableRow>,
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default InfoPanel
