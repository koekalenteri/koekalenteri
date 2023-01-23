import { useMemo } from 'react'
import { Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import { Event, Registration } from 'koekalenteri-shared/model'

import { eventDates } from '../../../utils'


interface Props {
  event: Event
  registrations: Registration[]
}

const InfoPanel = ({ event, registrations }: Props) => {
  const dates = useMemo(() => eventDates(event), [event])
  const registrationsByClass: Record<string, number> = useMemo(() => {
    const byClass: Record<string, number> = { reserve: 0 }
    for (const reg of registrations) {
      const c = reg.group ? reg.class ?? reg.eventType : 'reserve'
      if (!(c in byClass)) {
        byClass[c] = 0
      }
      byClass[c]++
    }
    return byClass
  }, [registrations])

  return (
    <TableContainer component={Paper} elevation={4} sx={{
      width: 300,
      backgroundColor: 'background.selected',
      p: 1,
      '& .MuiTableCell-root': { py: 0, px: 1 },
    }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell colSpan={4 + (dates.length > 1 ? 1 : 0)}><b>Ilmoittautuneet</b></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>• osallistujat</TableCell>
          </TableRow>
          {Object.keys(registrationsByClass).filter(c => c !== 'reserve').map(c => (
            <TableRow>
              <TableCell align="right">{c}</TableCell>
              <TableCell align="right">{registrationsByClass[c]}</TableCell>
              <TableCell align="right"><Button size="small" sx={{fontSize: '0.5rem'}}>LÄHETÄ&nbsp;KOEPAIKKAILMOITUS</Button></TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>• varasijalla</TableCell>
            <TableCell align="right">{registrationsByClass.reserve ?? 0}</TableCell>
            <TableCell align="right"><Button size="small" sx={{fontSize: '0.5rem'}} disabled={registrationsByClass.reserve === 0}>LÄHETÄ&nbsp;VARASIJAILMOITUS</Button></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default InfoPanel
