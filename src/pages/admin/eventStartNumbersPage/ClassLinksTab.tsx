import ContentCopy from '@mui/icons-material/ContentCopy'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

interface Props {
  /** Every class of the trial, whichever day it runs: a class's link is one link, not one a day. */
  readonly classes: string[]
  readonly onCopy: (eventClass: string) => void
  readonly onRevoke: (eventClass: string) => void
}

/**
 * The event secretary's hand-out sheet: one row per class, and what can be done with its link —
 * hand it out, or call it back.
 *
 * The classes are shared out once, before the draw, so they are all here together rather than each
 * behind its own tab (KOE-1433). The sentence saying what the link is for stays: copying a link says
 * nothing about what the receiver can then do with it, and the secretary reaching for this is doing
 * it once a season — "kyllä se kopioituu, mutta ei oikein selitä, että mihin tätä voisi käyttää"
 * (KOE-1267).
 */
export function ClassLinksTab({ classes, onCopy, onRevoke }: Props) {
  const { t } = useTranslation()

  return (
    <Stack spacing={1}>
      <Typography color="text.secondary" variant="body2">
        {t('startNumbers.copyLinkInfo')}
      </Typography>
      <Table size="small">
        <TableBody>
          {classes.map((eventClass) => (
            <TableRow key={eventClass}>
              <TableCell sx={{ fontWeight: 'bold', width: '6ch' }}>{eventClass}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 0.5 }}>
                  <Button
                    onClick={() => onCopy(eventClass)}
                    size="small"
                    startIcon={<ContentCopy fontSize="small" />}
                    variant="outlined"
                  >
                    {t('startNumbers.copyLink')}
                  </Button>
                  <Button onClick={() => onRevoke(eventClass)} size="small">
                    {t('startNumbers.revokeLink')}
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  )
}
