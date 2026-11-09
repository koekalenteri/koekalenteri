import type { ReactNode } from 'react'
import type { FormatOwner } from '@/lib/event'
import type { KcBadge } from '@/lib/kennelliittoResults'
import type { ExerciseSlot } from '@/lib/resultTasks'
import type { EventStation, NowtZeroFault, PublicJudge, Registration } from '@/types'
import type { ResultEdit, TaskEdit } from '../../components/stationScoring/types'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTypeOf } from '@/lib/event'
import { scoresAtPosts } from '@/lib/liveFormat'
import { getRegistrationPlacement } from '@/lib/registration'
import { formatTaskName } from '@/lib/results'
import { columnKey, effectiveJudge, endedBefore, exercisePostsOf } from '@/lib/resultTasks'
import { JudgeSelect } from '../../components/stationScoring/JudgeSelect'
import { ResultSummary } from '../../components/stationScoring/ResultSummary'
import { asksOutcome, outcomeLabelKeys, RoundOutcome } from '../../components/stationScoring/RoundOutcome'
import { TaskScore } from '../../components/stationScoring/TaskScore'
import { sameResultEdit, seededResultEdit } from '../../components/stationScoring/types'
import { KennelliittoStatus } from './KennelliittoStatus'

interface Props {
  readonly registrations: Registration[]
  /**
   * The columns: every exercise any dog of the view has (`roundColumns`), the whole round or one post's.
   * The dogs of one class may differ, when the class splits into groups by start number.
   */
  readonly round: ExerciseSlot[]
  /** A dog's own slots in this view. A column the dog has no slot in stays empty on its row. */
  readonly roundFor: (registration: Registration) => ExerciseSlot[]
  /** A dog's whole round, for deriving the prize. Absent in a post's own view, where it is unknowable. */
  readonly fullRoundFor?: (registration: Registration) => ExerciseSlot[]
  /**
   * A dog's whole round in every view, a post's own included: which exercises come after the post its
   * round ended at, and so read "kesk" (KOE-1669). Not a signal to derive a prize, as {@link fullRoundFor} is.
   */
  readonly wholeRoundFor: (registration: Registration) => ExerciseSlot[]
  /** The trial, whose format (`formatTypeOf`) decides what is entered and how a result is spelled. */
  readonly event: FormatOwner
  readonly eventClass?: string
  readonly stations: EventStation[]
  /** Set when the view covers one post only. */
  readonly stationId?: string
  /** Who may have judged at a given post. */
  readonly judgesFor: (stationId: string) => PublicJudge[]
  /** The class's or event's judges, for event types with no posts to attribute the scoring to. */
  readonly judges?: PublicJudge[]
  /** The judge last chosen at each post, carried to the next dog. */
  readonly defaultJudges: Record<string, PublicJudge | undefined>
  readonly onJudgeChange: (stationId: string, judge?: PublicJudge) => void
  readonly edits: Record<string, ResultEdit>
  readonly disabled?: boolean
  /**
   * The dog's edit as it now stands, and how to tell it is back to what is stored, and so nothing to save.
   * The caller asks that of the edit as it would be saved (`rebaseResultEdit`): a score another writer has
   * since moved is no difference of the secretary's.
   */
  readonly onChange: (registrationId: string, edit: ResultEdit, isClean: (saved: ResultEdit) => boolean) => void
  /**
   * One card per dog instead of one row: the round's controls stacked under the dog's name, for a
   * phone in the field (KOE-1280). The controls are the same either way; only their arrangement differs.
   */
  readonly compact?: boolean
  /**
   * Where each dog's result stands with Kennelliitto's Omakoira (KOE-1140), by the send dialog's rule
   * (`kcResultBadges`). The column shows only with it.
   */
  readonly kennelliitto?: ReadonlyMap<string, KcBadge>
  /**
   * Each awarded dog's rank (`placementsFor`). Absent in a post's own view, where it is unknowable. A row
   * with an unsaved edit shows none: the rank is of what is stored, and the edit may move it.
   */
  readonly placements?: ReadonlyMap<string, number>
}

/** A dog's controls, built once and placed by whichever layout is showing. */
interface RowControls {
  /** Who judged the dog, for event types with no posts to attribute the scoring to. */
  judge?: ReactNode
  /** One per column; `null` where the dog's round has no such slot. */
  tasks: ReactNode[]
  outcome: ReactNode
  result: ReactNode
}

/** A judge's stop stored on the dog's result, which stays clearable where the format has none (KOE-1643). */
const carriesStop = (registration: Registration): boolean =>
  registration.eventResult?.retirement?.cause === 'judgeStopped'

const taskKey = (task: { exercise: number; part: number }) => `${task.exercise}#${task.part}`

/** Where the carried judge lives in `defaultJudges` for rows that have no posts. */
const EVENT_JUDGE_KEY = 'event'

/**
 * One table serving both the event secretary and a station secretary. They differ only in which slots
 * are in scope (the whole round, or one post's), so the difference is a prop, not a screen.
 */
function ResultsTable({
  registrations,
  round,
  roundFor,
  fullRoundFor,
  wholeRoundFor,
  event,
  eventClass,
  stations,
  stationId,
  judgesFor,
  judges = [],
  defaultJudges,
  onJudgeChange,
  edits,
  disabled,
  onChange,
  compact,
  kennelliitto,
  placements,
}: Props) {
  const { t } = useTranslation()
  const eventType = formatTypeOf(event)
  const qualitative = !scoresAtPosts(eventType)
  const outcomeColumn = outcomeLabelKeys().column
  // A format with nothing to ask has no column, unless a dog's stored stop still needs clearing.
  const showOutcome = asksOutcome(eventType, registrations.some(carriesStop))

  // The stored result seeds the row, so an edit cannot quietly drop what is already recorded. For a
  // qualitative type that is the judge's decision; for a post-scored round it is every task the posts
  // have saved so far: the whole-round submission replaces the task array, so a row starting blank
  // would erase the other posts' scores the moment the secretary corrected one cell.
  const seededEdit = (registration: Registration): ResultEdit =>
    seededResultEdit(registration.eventResult, eventType, eventClass)

  // Recording anything for a dog attributes it to whoever is judging, the same way scoring a task
  // does at a post — so with one judge the secretary never touches a judge control at all.
  const attributed = (next: ResultEdit): ResultEdit => {
    if (qualitative) {
      const judge = next.judge ?? defaultJudges[EVENT_JUDGE_KEY] ?? judges[0]
      if (judge) return { ...next, judge }
    }
    return next
  }

  // An edit equal to what is stored is not an edit: the row reports itself clean, as the event form
  // does, so reverting a change takes the save button back with it.
  const report = (registration: Registration, next: ResultEdit) => {
    const stored = attributed(seededEdit(registration))
    onChange(registration.id, next, (saved) => sameResultEdit(attributed(saved), stored))
  }

  // A column is an exercise number, "Rasti 3", whatever post a dog's group did it at (KOE-1665).
  const columnName = (column: ExerciseSlot) => formatTaskName(column, t)

  const controlsFor = (registration: Registration): RowControls => {
    const edit = edits[registration.id] ?? seededEdit(registration)
    const { tasks } = edit
    const own = roundFor(registration)
    // A post after the one the round ended at was never reached, read off the dog's whole round as the
    // post's own link reads it off its visit (KOE-1669).
    const whole = wholeRoundFor(registration)
    const exercisePosts = exercisePostsOf(whole)
    const notReached = (task: ExerciseSlot) => endedBefore(edit.retirement, task.exercise, exercisePosts)
    // Where the round may have ended: an exercise of the dog's order, at the post on view where there is one.
    const places = exercisePosts
      .map((post, at) => ({ exercise: at + 1, stationId: post }))
      .filter((place) => !stationId || place.stationId === stationId)

    const writeTask = (task: ExerciseSlot, changes: Partial<TaskEdit>) => {
      const existing = tasks.find((item) => taskKey(item) === taskKey(task))
      // Scoring a task attributes it to whoever is showing, so the secretary only touches the
      // judge control when it actually changes. A stored judge stands while it judges at the exercise's
      // post (`effectiveJudge`, KOE-1665).
      const judge = changes.judge ?? effectiveJudge(existing, judgesFor(task.stationId), defaultJudges[task.stationId])

      report(registration, {
        ...edit,
        tasks: [
          ...tasks.filter((item) => taskKey(item) !== taskKey(task)),
          {
            exercise: task.exercise,
            part: task.part,
            points: existing?.points ?? null,
            ...existing,
            ...changes,
            ...(judge ? { judge } : {}),
          },
        ],
      })
    }

    const setTask = (task: ExerciseSlot, points: number | null, zeroFault?: NowtZeroFault) =>
      writeTask(task, { points, zeroFault })

    return {
      judge: qualitative ? (
        <JudgeSelect
          disabled={disabled}
          judges={judges}
          onChange={(judge) => {
            onJudgeChange(EVENT_JUDGE_KEY, judge)
            report(registration, { ...edit, ...(judge ? { judge } : {}) })
          }}
          value={edit.judge ?? defaultJudges[EVENT_JUDGE_KEY] ?? judges[0]}
        />
      ) : undefined,
      outcome: (
        <RoundOutcome
          carriesStop={carriesStop(registration)}
          disabled={disabled}
          event={event}
          inline={!compact}
          places={qualitative ? undefined : places}
          stationId={stationId}
          stations={stations}
          onChange={(next) => report(registration, attributed(next))}
          value={edit}
        />
      ),
      result: (
        <ResultSummary
          disabled={disabled}
          edit={edit}
          event={event}
          eventClass={eventClass}
          onChange={(next) => report(registration, attributed(next))}
          round={fullRoundFor?.(registration)}
          placement={edits[registration.id] ? undefined : placements?.get(registration.id)}
          stored={registration.eventResult}
        />
      ),
      tasks: round.map((column) => {
        // A dog's slot belongs in a column of the same exercise number, split the same way, the same part.
        const task = own.find((item) => columnKey(item) === columnKey(column))
        if (!task) return null

        return (
          <TaskScore
            defaultJudge={defaultJudges[task.stationId]}
            disabled={disabled}
            judges={judgesFor(task.stationId)}
            key={taskKey(task)}
            name={formatTaskName(task, t)}
            notReached={notReached(task)}
            inline={!compact}
            showName={compact}
            onChange={setTask}
            onJudgeChange={(item, judge) => {
              onJudgeChange(item.stationId, judge)
              writeTask(item, { judge })
            }}
            task={task}
            value={tasks.find((entry) => taskKey(entry) === taskKey(task))}
          />
        )
      }),
    }
  }

  if (compact) {
    return (
      <Stack spacing={1}>
        {registrations.map((registration) => (
          <ResultCard
            controls={controlsFor(registration)}
            key={registration.id}
            kennelliitto={kennelliitto}
            qualitative={qualitative}
            registration={registration}
          />
        ))}
      </Stack>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader sx={{ '& td': { py: 0.5 }, '& td, & th': { px: 1 } }}>
        <TableHead>
          <TableRow>
            <TableCell align="right">{t('results.column.number')}</TableCell>
            <TableCell>{t('results.column.team')}</TableCell>
            {qualitative && <TableCell>{t('results.judge')}</TableCell>}
            {round.map((task) => {
              const [only, ...others] = judgesFor(task.stationId)

              return (
                <TableCell align="center" key={columnKey(task)}>
                  {columnName(task)}
                  {/* A post's lone judge is the same on every row, so it is said once, here. */}
                  {only && others.length === 0 && (
                    <Typography component="div" variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                      {only.name}
                    </Typography>
                  )}
                </TableCell>
              )
            })}
            {/* An entered result comes first, since whether a stop can stand depends on it; a derived one
                sums the row up and closes it. */}
            {qualitative && <TableCell>{t('results.column.result')}</TableCell>}
            {showOutcome && <TableCell>{t(outcomeColumn)}</TableCell>}
            {!qualitative && <TableCell align="right">{t('results.column.result')}</TableCell>}
            {kennelliitto && <TableCell>{t('results.kennelliitto.column')}</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {registrations.map((registration) => {
            const controls = controlsFor(registration)

            return (
              <TableRow hover key={registration.id}>
                <TableCell align="right">{getRegistrationPlacement(registration)?.number}</TableCell>
                <TableCell sx={{ minWidth: 260 }}>
                  {registration.dog.name}
                  <Typography component="div" variant="body2" sx={{ color: 'text.secondary' }}>
                    {[registration.dog.regNo, registration.handler?.name].filter(Boolean).join(' · ')}
                  </Typography>
                </TableCell>
                {qualitative && <TableCell>{controls.judge}</TableCell>}
                {controls.tasks.map((task, index) => (
                  <TableCell align="center" key={columnKey(round[index])}>
                    {task}
                  </TableCell>
                ))}
                {qualitative && <TableCell>{controls.result}</TableCell>}
                {showOutcome && <TableCell>{controls.outcome}</TableCell>}
                {!qualitative && <TableCell align="right">{controls.result}</TableCell>}
                {kennelliitto && (
                  <TableCell>
                    <KennelliittoStatus badge={kennelliitto.get(registration.id)} registration={registration} />
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

interface CardProps {
  readonly registration: Registration
  readonly qualitative: boolean
  readonly controls: RowControls
  readonly kennelliitto?: ReadonlyMap<string, KcBadge>
}

/**
 * A dog on a phone: who it is on top, the round's controls under it. A derived prize sits beside the
 * name where the eye lands first; an entered one is a control like the rest and takes its place below.
 */
const ResultCard = ({ registration, qualitative, controls, kennelliitto }: CardProps) => {
  const identity = [registration.dog.regNo, registration.handler?.name].filter(Boolean).join(' · ')
  const placementNumber = getRegistrationPlacement(registration)?.number

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          mb: 1,
        }}
      >
        <Box>
          <Typography
            variant="subtitle1"
            component="h2"
            sx={{
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            {placementNumber != null && `${placementNumber}. `}
            {registration.dog.name}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            {identity}
          </Typography>
          {kennelliitto && <KennelliittoStatus badge={kennelliitto.get(registration.id)} registration={registration} />}
        </Box>
        {!qualitative && <Box sx={{ flexShrink: 0, textAlign: 'right' }}>{controls.result}</Box>}
      </Stack>
      <Stack spacing={1.5}>
        {controls.judge}
        {controls.tasks.some(Boolean) && (
          <Stack
            direction="row"
            useFlexGap
            sx={{
              columnGap: 1.5,
              flexWrap: 'wrap',
              rowGap: 1,
            }}
          >
            {controls.tasks}
          </Stack>
        )}
        {qualitative && controls.result}
        {controls.outcome}
      </Stack>
    </Paper>
  )
}

export default memo(ResultsTable)
