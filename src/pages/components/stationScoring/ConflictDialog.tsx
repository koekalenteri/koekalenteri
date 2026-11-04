import type { TFunction } from 'i18next'
import type { EventResultVersion, RegistrationClass, ResultConflict } from '@/types'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { shownEventResult } from '@/lib/results'
import { isRecordedTask, stationTasks, stationWriter } from '@/lib/resultTasks'
import { AsyncButton } from '../AsyncButton'

/** Which version the secretary decided to keep, per dog. */
export type ConflictChoice = 'stored' | 'mine'

interface Props {
  readonly conflicts: ResultConflict[]
  readonly eventType: string
  /**
   * The exercises of a dog a post's own view disputes. The row then shows those scores, since a post's
   * version carries no totals and the prize depends on posts it cannot see. Absent where the dispute is
   * over the whole result.
   */
  readonly exercisesOf?: (id: string) => readonly number[]
  readonly registrations: readonly { id: string; class?: RegistrationClass | null; dog?: { name?: string } }[]
  readonly choices: Record<string, ConflictChoice>
  readonly onChoose: (id: string, choice: ConflictChoice) => void
  readonly onResolve: () => Promise<void>
  readonly onClose: () => void
}

/** One version of the result, spelled as Kennelliitto lists it (KOE-1592), with its points where it has them. */
const describe = (result: EventResultVersion, eventType: string, eventClass?: string) =>
  [
    shownEventResult(result.result, eventType, eventClass),
    result.points === undefined ? undefined : `${result.points} p`,
  ]
    .filter(Boolean)
    .join(' · ')

/** One exercise's score, its parts summed by eye and a zero's reason beside it: "Rasti 2: 8 + 7 p". */
const exerciseScore = (tasks: NonNullable<EventResultVersion['tasks']>, t: TFunction<'translation'>) => {
  const points = tasks.map((task) => task.points ?? '–').join(' + ')
  const reasons = tasks.flatMap((task) => (task.zeroFault ? [t(`results.zeroFaults.${task.zeroFault}`)] : []))
  const reason = reasons.length ? ` (${reasons.join(', ')})` : ''

  return `${t('results.column.task', { number: tasks[0].exercise })}: ${points} p${reason}`
}

/** How a version says the round ended, where it did. */
const outcomeOf = ({ elimination, retirement }: EventResultVersion, t: TFunction<'translation'>) => {
  if (elimination) return t(`results.eliminatingFaults.${elimination.fault}`)
  return retirement && t(`results.retirement.${retirement.cause}`)
}

/** One version as a post's own: what the post recorded and how the round ended, or that it holds nothing. */
const describeAtPost = (result: EventResultVersion, exercises: readonly number[], t: TFunction<'translation'>) => {
  const recorded = stationTasks(result.tasks, exercises)
    .filter(isRecordedTask)
    .sort((a, b) => a.exercise - b.exercise || a.part - b.part)
  const scores = [...new Set(recorded.map((task) => task.exercise))].map((exercise) =>
    exerciseScore(
      recorded.filter((task) => task.exercise === exercise),
      t
    )
  )

  return [...scores, outcomeOf(result, t)].filter(Boolean).join(' · ') || t('results.conflictNothing')
}

/**
 * Both versions, side by side, for a person to choose between.
 *
 * The server cannot pick: the two disagree about what the dog did, and only someone who was there
 * knows which is right. Keeping the work on screen until that choice is made is the point — a conflict
 * that simply failed the save would throw away everything the secretary had entered.
 */
export const ConflictDialog = ({
  conflicts,
  eventType,
  exercisesOf,
  registrations,
  choices,
  onChoose,
  onResolve,
  onClose,
}: Props) => {
  const { t } = useTranslation()
  const registrationOf = (id: string) => registrations.find((reg) => reg.id === id)
  const nameOf = (id: string) => registrationOf(id)?.dog?.name ?? id
  const classOf = (id: string) => registrationOf(id)?.class ?? undefined

  const versionOf = (version: EventResultVersion, id: string) =>
    exercisesOf ? describeAtPost(version, exercisesOf(id), t) : describe(version, eventType, classOf(id))

  // A post's version is its own tasks', which may have a writer of their own; a post's link gets no names at all.
  const storedLabel = ({ id, stored }: ResultConflict) => {
    const who = exercisesOf ? stationWriter(stored.tasks, exercisesOf(id)) : stored.updatedBy
    const result = versionOf(stored, id)
    return who ? t('results.conflictStored', { result, who }) : t('results.conflictStoredUnnamed', { result })
  }

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={conflicts.length > 0}>
      <DialogTitle>{t('results.conflictTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t('results.conflictInfo')}</DialogContentText>
        <Stack spacing={2}>
          {conflicts.map((conflict) => (
            <Stack key={conflict.id} spacing={0.5}>
              <Typography
                sx={{
                  fontWeight: 600,
                }}
              >
                {nameOf(conflict.id)}
              </Typography>
              <RadioGroup
                onChange={(_event, value) => onChoose(conflict.id, value === 'mine' ? 'mine' : 'stored')}
                value={choices[conflict.id] ?? 'stored'}
              >
                <FormControlLabel control={<Radio size="small" />} label={storedLabel(conflict)} value="stored" />
                <FormControlLabel
                  control={<Radio size="small" />}
                  label={t('results.conflictMine', { result: versionOf(conflict.submitted, conflict.id) })}
                  value="mine"
                />
              </RadioGroup>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <AsyncButton onClick={onResolve} variant="contained">
          {t('results.conflictResolve')}
        </AsyncButton>
      </DialogActions>
    </Dialog>
  )
}
