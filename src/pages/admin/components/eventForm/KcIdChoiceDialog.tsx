import type { EventKcIdChoice } from '@/types'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

/** Text for screen readers only: the column of buttons has a name, and none to look at. */
const VISUALLY_HIDDEN = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
} as const

/**
 * A short value is read at a glance only on one line. Paikka, Järjestäjä, Kennelliitto's trial name and
 * its free-text Tila ("Ylituomarin hyväksyttäväksi") wrap into the width left (KOE-1641).
 */
const ONE_LINE = { whiteSpace: 'nowrap' } as const

/**
 * Half MUI's 16 px at each side of a cell: eight columns of padding would take 256 px of the 963 px a
 * dialog has at 1027 px, and a long Koetunnus, name and place then push the table past the dialog.
 */
const CELL_PADDING = { '& .MuiTableCell-root': { px: 1 } } as const

/** All the columns: a reason row under a trial spans them. */
const COLUMN_COUNT = 8

type Props = {
  readonly choices: EventKcIdChoice[]
  readonly linkedKcGuids?: ReadonlySet<string>
  readonly onClose: () => void
  readonly onSelect: (choice: EventKcIdChoice) => void
}

export default function KcIdChoiceDialog({ choices, linkedKcGuids, onClose, onSelect }: Props) {
  const { t } = useTranslation()

  return (
    <Dialog fullWidth maxWidth="lg" open={choices.length > 0} onClose={onClose}>
      <DialogTitle>{t('event.kcIdChoiceTitle')}</DialogTitle>
      <DialogContent dividers sx={{ p: 1 }}>
        <Table size="small" sx={CELL_PADDING}>
          <TableHead>
            <TableRow>
              <TableCell sx={ONE_LINE}>{t('event.kcIdChoiceId')}</TableCell>
              <TableCell sx={ONE_LINE}>{t('event.kcIdChoiceType')}</TableCell>
              <TableCell sx={ONE_LINE}>{t('event.kcIdChoiceClasses')}</TableCell>
              <TableCell sx={ONE_LINE}>{t('event.kcIdChoiceTime')}</TableCell>
              <TableCell>{t('event.kcIdChoiceLocation')}</TableCell>
              <TableCell>{t('event.kcIdChoiceOrganizer')}</TableCell>
              <TableCell>{t('event.kcIdChoiceStatus')}</TableCell>
              <TableCell>
                <span style={VISUALLY_HIDDEN}>{t('event.kcIdSelect')}</span>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {choices.map((choice, index) => {
              // The index is part of the key: two trials without a GUID can be alike in everything shown.
              const key = `${choice.kcGuid ?? choice.kcTunnus ?? ''}|${choice.startDate}|${index}`
              const reason = unselectableReason(choice, linkedKcGuids)
              return (
                <Fragment key={key}>
                  {/* A trial with a reason under it has no divider between the two: they read as one entry. */}
                  <TableRow sx={reason ? { '& > td': { borderBottom: 'none' } } : undefined}>
                    <TableCell sx={ONE_LINE}>{choice.kcTunnus ?? '-'}</TableCell>
                    {/* NOME-B must not break at its hyphen; Kennelliitto's free-text name after it may wrap. */}
                    <TableCell>
                      <span style={ONE_LINE}>{choice.eventType}</span>
                      {choice.name ? ` ${choice.name}` : null}
                    </TableCell>
                    <TableCell sx={ONE_LINE}>{choice.classes.join(', ')}</TableCell>
                    <TableCell sx={ONE_LINE}>
                      {t('dateFormat.datespan', { end: choice.endDate, start: choice.startDate })}
                    </TableCell>
                    <TableCell>{choice.location}</TableCell>
                    <TableCell>{choice.organizer}</TableCell>
                    <TableCell>{choice.status}</TableCell>
                    <TableCell align="right">
                      {reason ? null : (
                        <Button variant="contained" size="small" onClick={() => onSelect(choice)}>
                          {t('event.kcIdSelect')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {reason ? (
                    <TableRow>
                      <TableCell colSpan={COLUMN_COUNT} sx={{ pt: 0 }}>
                        <Typography variant="caption" color={reason.color}>
                          {t(reason.text)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          {t('close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * Why a trial cannot be linked, or undefined when it can. Without a GUID Kennelliitto has not given it an
 * identifier yet; with one already linked, another event of this system holds it.
 */
function unselectableReason(
  choice: EventKcIdChoice,
  linkedKcGuids: ReadonlySet<string> | undefined
): UnselectableReason | undefined {
  if (!choice.kcGuid) return { color: 'text.secondary', text: 'event.kcGuidMissing' }
  if (linkedKcGuids?.has(choice.kcGuid)) return { color: 'error', text: 'event.kcIdChoiceLinked' }
  return undefined
}

type UnselectableReason = {
  readonly color: 'error' | 'text.secondary'
  readonly text: 'event.kcGuidMissing' | 'event.kcIdChoiceLinked'
}
