import { useMemo } from 'react'
import { Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import { EmailTemplateId, Event, Registration } from 'koekalenteri-shared/model'

import { eventDates } from '../../../utils'

interface Props {
  event: Event
  registrations: Registration[]
  onOpenMessageDialog?: (recipients: Registration[], templateId?: EmailTemplateId) => void
}

function getRegClass(reg: Registration): string {
  if (reg.cancelled) return 'cancelled'
  if (reg.group) {
    return reg.class ?? reg.eventType
  }
  return 'reserve'
}

const InfoPanel = ({ event, registrations, onOpenMessageDialog }: Props) => {
  const dates = useMemo(() => eventDates(event), [event])
  const registrationsByClass: Record<string, Registration[]> = useMemo(() => {
    const byClass: Record<string, Registration[]> = { reserve: [] }
    for (const reg of registrations) {
      const c = getRegClass(reg)
      if (!(c in byClass)) {
        byClass[c] = []
      }
      byClass[c].push(reg)
    }
    return byClass
  }, [registrations])

  return (
    <TableContainer
      component={Paper}
      elevation={4}
      sx={{
        width: 300,
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
            <TableCell>• osallistujat</TableCell>
          </TableRow>
          {Object.keys(registrationsByClass)
            .filter((c) => c !== 'reserve' && c !== 'cancelled')
            .map((c) => (
              <TableRow key={c}>
                <TableCell align="right">{c}</TableCell>
                <TableCell align="right">{registrationsByClass[c].length}</TableCell>
                <TableCell align="right">
                  <Button size="small" sx={{ fontSize: '0.5rem' }} disabled={registrationsByClass[c].length === 0}>
                    LÄHETÄ&nbsp;KOEPAIKKAILMOITUS
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          <TableRow>
            <TableCell>• varasijalla</TableCell>
            <TableCell align="right">{registrationsByClass.reserve.length ?? 0}</TableCell>
            <TableCell align="right">
              <Button
                size="small"
                sx={{ fontSize: '0.5rem' }}
                disabled={registrationsByClass.reserve.length === 0}
                onClick={() => onOpenMessageDialog?.(registrationsByClass.reserve, 'reserve')}
              >
                LÄHETÄ&nbsp;VARASIJAILMOITUS
              </Button>
            </TableCell>
          </TableRow>
          {!registrationsByClass.cancelled ? null : (
            <TableRow>
              <TableCell>• peruneet</TableCell>
              <TableCell align="right">{registrationsByClass.cancelled.length}</TableCell>
              <TableCell align="right">&nbsp;</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default InfoPanel
