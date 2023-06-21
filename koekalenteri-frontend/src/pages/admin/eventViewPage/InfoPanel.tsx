import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { EmailTemplateId, Event, Registration } from 'koekalenteri-shared/model'

import useEventRegistrationInfo from '../../../hooks/useEventRegistrationsInfo'

interface Props {
  event: Event
  registrations: Registration[]
  onOpenMessageDialog?: (recipients: Registration[], templateId?: EmailTemplateId) => void
}

const InfoPanel = ({ event, registrations, onOpenMessageDialog }: Props) => {
  const { dates, reserveByClass, numbersByClass, selectedByClass, stateByClass } = useEventRegistrationInfo(
    event,
    registrations
  )

  return (
    <TableContainer
      component={Paper}
      elevation={4}
      sx={{
        width: 320,
        backgroundColor: 'background.selected',
        p: 1,
        '& .MuiTableCell-root': { py: 0, px: 1 },
      }}
    >
      <Table>
        <TableHead>
          <TableRow>
            <TableCell colSpan={4 + (dates.length > 1 ? 1 : 0)}>
              <b>Ilmoittautuneet</b>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell colSpan={3}>
              <Typography variant="caption" noWrap>
                • osallistujat
              </Typography>
            </TableCell>
          </TableRow>
          {Object.entries(numbersByClass).map(([c, nums]) => {
            return (
              <TableRow key={c}>
                <TableCell align="left">
                  <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                    {c}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" noWrap color={nums.invalid ? 'error' : 'info.dark'}>
                    {nums.participants} / {nums.places}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    sx={{ fontSize: '0.5rem' }}
                    disabled={
                      nums.participants === 0 || nums.invalid || !['confirmed', 'picked'].includes(stateByClass[c])
                    }
                    onClick={() =>
                      onOpenMessageDialog?.(
                        selectedByClass[c],
                        stateByClass[c] === 'confirmed' ? 'picked' : 'invitation'
                      )
                    }
                  >
                    LÄHETÄ&nbsp;{stateByClass[c] === 'confirmed' ? 'KOEPAIKKAILMOITUS' : 'KOEKUTSU'}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
          <TableRow>
            <TableCell colSpan={3}>
              <Typography variant="caption" noWrap>
                • varasijalla
              </Typography>
            </TableCell>
          </TableRow>
          {Object.entries(numbersByClass).map(([c, nums]) => {
            return (
              <TableRow key={c}>
                <TableCell align="left">
                  <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                    {c}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" noWrap color="info.dark">
                    {nums.reserve}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    sx={{ fontSize: '0.5rem' }}
                    disabled={nums.reserve === 0}
                    onClick={() => onOpenMessageDialog?.(reserveByClass[c], 'reserve')}
                  >
                    LÄHETÄ&nbsp;VARASIJAILMOITUS
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default InfoPanel
