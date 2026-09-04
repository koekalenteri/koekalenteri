import type { Theme } from '@mui/material'
import type { ReactNode } from 'react'
import type { StartNumberEntry } from '../../../api/startNumbers'
import type { PlacedRegistration } from '../components/StartDaySelector'
import type { StartNumberRow } from './StartNumbersTable'
import Save from '@mui/icons-material/Save'
import { useMediaQuery } from '@mui/material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUnsavedChangesWarning } from '../../../hooks/useUnsavedChangesWarning'
import {
  getRegistrationClass,
  getRegistrationPlacement,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../../lib/registration'
import { AsyncButton } from '../../components/AsyncButton'
import { StartDaySelector } from '../components/StartDaySelector'
import { useStartDayClasses } from '../components/useStartDayClasses'
import { duplicateNumbers, StartNumbersTable } from './StartNumbersTable'

/** A dog on a draw sheet: enough to place it, name it, and say which number it holds. */
export type StartNumberDog = PlacedRegistration & {
  id: string
  cancelled?: boolean
  class?: string | null
  eventType?: string
  dog: { name?: string; regNo?: string }
  handler?: { name?: string }
}

interface Props {
  readonly registrations: StartNumberDog[]
  /**
   * Writes the batch; the class is the one whose tab is open, and a classless event has none.
   * Resolves false when the save did not go through — the entries then stay on screen for another
   * try, and the screen that owns the call has already said what went wrong in its own words.
   */
  readonly onSave: (numbers: StartNumberEntry[], eventClass?: string) => Promise<boolean>
  /** The screen's own head: the way back and the title for the secretary, the trial for a link. */
  readonly header?: ReactNode
  /** What the open class offers beyond its sheet — the event secretary's link controls (KOE-1267). */
  readonly renderClassActions?: (eventClass: string) => ReactNode
}

/**
 * The on-site draw's numbers, entered as a batch (KOE-1218): day, then class, then one field per dog.
 *
 * Shared by the two ways in (KOE-1267) — the event secretary's page and a class secretary's tokenized
 * link — so the sheet a class secretary works cannot drift from the one the event secretary has. The
 * difference between them is what data reaches this component and where the save goes.
 */
export function StartNumbersEntry({ registrations, onSave, header, renderClassActions }: Props) {
  const { t } = useTranslation()
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

    // The saved numbers come back through the live registration patches; the drafts have served.
    if (await onSave(numbers, eventClass)) setDrafts({})
  }, [drafts, eventClass, onSave])

  return (
    <>
      {header}

      <StartDaySelector days={days} onChange={setSelectedDay} value={day} />

      <Tabs onChange={(_event, value) => setSelectedClass(value)} sx={{ px: 2 }} value={eventClass ?? false}>
        {classes.map((item) => (
          <Tab key={item} label={item} value={item} />
        ))}
      </Tabs>

      {eventClass && renderClassActions?.(eventClass)}

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
    </>
  )
}
