import type { Theme } from '@mui/material'
import type { StartDay } from './eventStartNumbersPage/StartDaySelector'
import type { StartNumberRow } from './eventStartNumbersPage/StartNumbersTable'
import ArrowBack from '@mui/icons-material/ArrowBack'
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
import { Link, useParams } from 'react-router'
import { putStartNumbers } from '../../api/event'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { zonedDateString } from '../../i18n/dates'
import { reportError } from '../../lib/client/error'
import { errorSnackbarOptions } from '../../lib/client/snackbar'
import {
  compareRegistrationClasses,
  getRegistrationClass,
  getRegistrationPlacement,
  isRegistrationClass,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { Path } from '../../routeConfig'
import { AsyncButton } from '../components/AsyncButton'
import { idTokenAtom } from '../state'
import EventNotFound from './components/EventNotFound'
import { StartDaySelector } from './eventStartNumbersPage/StartDaySelector'
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

  const classes = useMemo(
    () =>
      [...new Set(registrations.filter(isScorableRegistration).map(getRegistrationClass))].sort(
        compareRegistrationClasses
      ),
    [registrations]
  )
  const [selectedClass, setSelectedClass] = useState<string | undefined>(classes[0])
  const [selectedDay, setSelectedDay] = useState<string | undefined>()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // The on-site draw is typed in as a batch; losing it to a stray navigation would mean redoing it (KOE-1283).
  useUnsavedChangesWarning(Object.values(drafts).some((value) => value !== ''))

  const eventClass = selectedClass ?? classes[0]

  const classRegistrations = useMemo(
    () => registrations.filter((reg) => isScorableRegistration(reg) && getRegistrationClass(reg) === eventClass),
    [eventClass, registrations]
  )

  // A multi-day class draws its numbers one morning at a time, so the entry goes day by day too
  // (KOE-1303). The days are the class's own placements, keyed the way the server scopes uniqueness.
  const days = useMemo<StartDay[]>(
    () =>
      classRegistrations
        .map((reg) => getRegistrationPlacement(reg)?.date)
        .filter((date): date is Date => !!date)
        .map((date) => ({ date, key: zonedDateString(date) }))
        .filter((day, index, all) => all.findIndex((other) => other.key === day.key) === index)
        .sort((a, b) => a.key.localeCompare(b.key)),
    [classRegistrations]
  )
  // A day picked on one class tab may not exist on the next; fall back to the first rather than an empty list.
  const day = days.find((item) => item.key === selectedDay)?.key ?? days[0]?.key

  const rows = useMemo<StartNumberRow[]>(
    () =>
      classRegistrations
        .filter((reg) => {
          const date = getRegistrationPlacement(reg)?.date
          return days.length < 2 || (date && zonedDateString(date) === day)
        })
        .sort(sortRegistrationsByDateClassTimeAndNumber)
        .map((reg) => ({
          dog: { name: reg.dog.name, regNo: reg.dog.regNo },
          groupNumber: reg.group?.number,
          handler: reg.handler,
          id: reg.id,
          placement: getRegistrationPlacement(reg),
          startNumber: reg.startGroup?.number,
        })),
    [classRegistrations, day, days.length]
  )

  // A number belongs to one dog across every day of the class (KOE-1303): Friday 1–24, Saturday
  // 25–48. The day filter narrows the list, not the check.
  const duplicates = useMemo(
    () =>
      duplicateNumbers(
        classRegistrations.map((reg) => ({ id: reg.id, startNumber: reg.startGroup?.number })),
        drafts
      ),
    [classRegistrations, drafts]
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
      <Box sx={{ pt: 2, px: 2 }}>
        <Button
          component={Link}
          size="small"
          startIcon={<ArrowBack fontSize="small" />}
          sx={{ ml: -1 }}
          to={Path.admin.viewEvent(eventId)}
        >
          {t('results.backToEvent')}
        </Button>
        <Typography variant="h6">{t('startNumbers.title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('startNumbers.info')}
        </Typography>
      </Box>

      <Tabs onChange={(_event, value) => setSelectedClass(value)} sx={{ px: 2 }} value={eventClass ?? false}>
        {classes.map((item) => (
          <Tab key={item} label={item} value={item} />
        ))}
      </Tabs>

      <StartDaySelector days={days} onChange={setSelectedDay} value={day} />

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
