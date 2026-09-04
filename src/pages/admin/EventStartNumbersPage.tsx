import type { Theme } from '@mui/material'
import type { StartNumberRow } from './eventStartNumbersPage/StartNumbersTable'
import Save from '@mui/icons-material/Save'
import { useMediaQuery } from '@mui/material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { putStartNumbers } from '../../api/event'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { reportError } from '../../lib/client/error'
import { errorSnackbarOptions } from '../../lib/client/snackbar'
import {
  getRegistrationClass,
  getRegistrationPlacement,
  isRegistrationClass,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { AsyncButton } from '../components/AsyncButton'
import { idTokenAtom } from '../state'
import { EntryPageHeader } from './components/EntryPageHeader'
import EventNotFound from './components/EventNotFound'
import { StartDaySelector } from './components/StartDaySelector'
import { useStartDayClasses } from './components/useStartDayClasses'
import { duplicateNumbers, StartNumbersTable } from './eventStartNumbersPage/StartNumbersTable'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom } from './state'

/**
 * The on-site draw's numbers, entered as a batch (KOE-1218). The calendar takes no part in the draw
 * itself: people draw at the venue, this screen receives the result — the same interaction shape as
 * results entry, which is what the ticket asks for.
 */
export default function EventStartNumbersPage() {
  const { t } = useTranslation()
  const { id: eventId = '' } = useParams()
  const token = useAtomValue(idTokenAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  // Four columns need more than a phone has; there the dog's details fold into one (KOE-1282).
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))

  const scorable = useMemo(() => registrations.filter(isScorableRegistration), [registrations])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // The on-site draw is typed in as a batch; losing it to a stray navigation would mean redoing it (KOE-1283).
  useUnsavedChangesWarning(Object.values(drafts).some((value) => value !== ''))

  // The draw runs day by day and the secretary works a whole morning before moving on (KOE-1350).
  const { classes, day, dayRegistrations, days, eventClass, setSelectedClass, setSelectedDay } =
    useStartDayClasses(scorable)

  const rows = useMemo<StartNumberRow[]>(
    () =>
      dayRegistrations
        .filter((reg) => getRegistrationClass(reg) === eventClass)
        .sort(sortRegistrationsByDateClassTimeAndNumber)
        .map((reg) => ({
          dog: { name: reg.dog.name, regNo: reg.dog.regNo },
          groupNumber: reg.group?.number,
          handler: reg.handler,
          id: reg.id,
          placement: getRegistrationPlacement(reg),
          startNumber: reg.startGroup?.number,
        })),
    [dayRegistrations, eventClass]
  )

  // A number belongs to one dog in the whole trial, every class and every day (KOE-1303): Friday
  // 1–24, Saturday 25–48. The class tab and the day filter narrow the list, not the check.
  const duplicates = useMemo(
    () =>
      duplicateNumbers(
        scorable.map((reg) => ({ id: reg.id, startNumber: reg.startGroup?.number })),
        drafts
      ),
    [drafts, scorable]
  )

  const handleChange = useCallback((id: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: value }))
  }, [])

  const handleSave = useCallback(async () => {
    const numbers = Object.entries(drafts)
      .filter(([, value]) => value !== '')
      .map(([id, value]) => ({ id, startNumber: Number(value) }))
    if (numbers.length === 0) return

    try {
      await putStartNumbers(
        eventId,
        { ...(isRegistrationClass(eventClass) ? { eventClass } : {}), numbers },
        token ?? ''
      )
      // The saved numbers come back through the live registration patches; the drafts have served.
      setDrafts({})
      enqueueSnackbar(t('startNumbers.saved'), { variant: 'success' })
    } catch (error) {
      // The server names the refused number (a duplicate, a taken slot); keep the entries on screen.
      reportError(error)
      enqueueSnackbar(t('startNumbers.saveFailed'), errorSnackbarOptions)
    }
  }, [drafts, eventClass, eventId, t, token])

  if (!event?.id) return <EventNotFound />

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <EntryPageHeader eventId={eventId} title={t('startNumbers.title')}>
        <Typography variant="body2" color="text.secondary">
          {t('startNumbers.info')}
        </Typography>
      </EntryPageHeader>

      <StartDaySelector days={days} onChange={setSelectedDay} value={day} />

      <Tabs onChange={(_event, value) => setSelectedClass(value)} sx={{ px: 2 }} value={eventClass ?? false}>
        {classes.map((item) => (
          <Tab key={item} label={item} value={item} />
        ))}
      </Tabs>

      <Box sx={{ flexGrow: 1, overflow: 'auto', p: { md: 2, xs: 1 } }}>
        <StartNumbersTable
          compact={compact}
          drafts={drafts}
          duplicates={duplicates}
          onChange={handleChange}
          rows={rows}
        />
      </Box>

      <Stack
        direction="row"
        justifyContent="flex-end"
        spacing={1}
        sx={{ borderColor: '#bdbdbd', borderTop: '1px solid', p: 1 }}
      >
        <Button disabled={Object.keys(drafts).length === 0} onClick={() => setDrafts({})}>
          {t('cancel')}
        </Button>
        <AsyncButton
          color="primary"
          disabled={Object.values(drafts).every((value) => value === '')}
          onClick={handleSave}
          startIcon={<Save />}
          variant="contained"
        >
          {t('startNumbers.save')}
        </AsyncButton>
      </Stack>
    </Paper>
  )
}
