import type { ReactNode } from 'react'
import type { RoundTask } from '../../../lib/results'
import type { EventResult, EventStation, NowtZeroFault, PublicJudge, Registration } from '../../../types'
import type { ResultEdit, TaskEdit } from './types'
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
import { parseEventResultCode, scoresAtPosts } from '../../../lib/results'
import { JudgeSelect } from './JudgeSelect'
import { ResultSummary } from './ResultSummary'
import { RoundOutcome } from './RoundOutcome'
import { TaskScore } from './TaskScore'
import { emptyEdit, isVoided } from './types'

interface Props {
  readonly registrations: Registration[]
  /** The scored slots this view covers: the whole round, or one post's. */
  readonly round: RoundTask[]
  /** The whole class round, for deriving the prize. Absent in a post's own view, where it is unknowable. */
  readonly fullRound?: RoundTask[]
  readonly eventType: string
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
  readonly onChange: (registrationId: string, edit: ResultEdit) => void
  /**
   * One card per dog instead of one row: the round's controls stacked under the dog's name, for a
   * phone in the field (KOE-1280). The controls are the same either way; only their arrangement differs.
   */
  readonly compact?: boolean
}

/** A dog's controls, built once and placed by whichever layout is showing. */
interface RowControls {
  /** Who judged the dog, for event types with no posts to attribute the scoring to. */
  judge?: ReactNode
  tasks: ReactNode[]
  outcome: ReactNode
  result: ReactNode
}

const taskKey = (task: { stationId: string; index: number }) => `${task.stationId}#${task.index}`

/** Where the carried judge lives in `defaultJudges` for rows that have no posts. */
const EVENT_JUDGE_KEY = 'event'

/**
 * One table serving both the event secretary and a station secretary. They differ only in which slots
 * are in scope — the whole round, or one post's one or two — so the difference is a prop, not a screen.
 */
function ResultsTable({
  registrations,
  round,
  fullRound,
  eventType,
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
}: Props) {
  const { t } = useTranslation()
  const qualitative = !scoresAtPosts(eventType)

  // The stored result seeds the row, so an edit cannot quietly drop what is already recorded. For a
  // qualitative type that is the judge's decision; for a post-scored round it is every task the posts
  // have saved so far — the whole-round submission replaces the task array, so a row starting blank
  // would erase the other posts' scores the moment the secretary corrected one cell. (The conflict
  // check only guards against a *stale* client; a current one would overwrite without a word.)
  const seededEdit = (stored?: EventResult): ResultEdit => {
    if (!stored) return emptyEdit

    if (!qualitative) {
      return {
        ...(stored.elimination ? { elimination: stored.elimination } : {}),
        ...(stored.retirement ? { retirement: stored.retirement } : {}),
        tasks: (stored.tasks ?? []).map(({ updatedAt: _at, updatedBy: _by, ...task }) => task),
      }
    }

    const resultCode = parseEventResultCode(stored.result, eventType, eventClass)

    return {
      ...(stored.elimination ? { elimination: stored.elimination } : {}),
      ...(stored.judge ? { judge: stored.judge } : {}),
      ...(stored.retirement ? { retirement: stored.retirement } : {}),
      ...(resultCode ? { resultCode } : {}),
      tasks: [],
    }
  }

  // Recording anything for a dog attributes it to whoever is judging, the same way scoring a task
  // does at a post — so with one judge the secretary never touches a judge control at all.
  const attributed = (next: ResultEdit): ResultEdit => {
    if (qualitative) {
      const judge = next.judge ?? defaultJudges[EVENT_JUDGE_KEY] ?? judges[0]
      if (judge) return { ...next, judge }
    }
    return next
  }

  const controlsFor = (registration: Registration): RowControls => {
    const edit = edits[registration.id] ?? seededEdit(registration.eventResult)
    const { tasks } = edit
    const voided = isVoided(edit)

    const writeTask = (task: RoundTask, changes: Partial<TaskEdit>) => {
      const existing = tasks.find((item) => taskKey(item) === taskKey(task))
      // Scoring a task attributes it to whoever is showing, so the secretary only touches the
      // judge control when it actually changes.
      const judge = changes.judge ?? existing?.judge ?? defaultJudges[task.stationId] ?? judgesFor(task.stationId)[0]

      onChange(registration.id, {
        ...edit,
        tasks: [
          ...tasks.filter((item) => taskKey(item) !== taskKey(task)),
          {
            index: task.index,
            points: existing?.points ?? null,
            stationId: task.stationId,
            ...existing,
            ...changes,
            ...(judge ? { judge } : {}),
          },
        ],
      })
    }

    const setTask = (task: RoundTask, points: number | null, zeroFault?: NowtZeroFault) =>
      writeTask(task, { points, zeroFault })

    return {
      judge: qualitative ? (
        <JudgeSelect
          disabled={disabled}
          judges={judges}
          onChange={(judge) => {
            onJudgeChange(EVENT_JUDGE_KEY, judge)
            onChange(registration.id, { ...edit, ...(judge ? { judge } : {}) })
          }}
          value={edit.judge ?? defaultJudges[EVENT_JUDGE_KEY] ?? judges[0]}
        />
      ) : undefined,
      outcome: (
        <RoundOutcome
          disabled={disabled}
          eventType={eventType}
          stationId={stationId}
          stations={stations}
          onChange={(next) => onChange(registration.id, attributed(next))}
          value={edit}
        />
      ),
      result: (
        <ResultSummary
          disabled={disabled}
          edit={edit}
          eventClass={eventClass}
          eventType={eventType}
          onChange={(next) => onChange(registration.id, attributed(next))}
          round={fullRound}
          stored={registration.eventResult}
        />
      ),
      tasks: round.map((task, index) => (
        <TaskScore
          defaultJudge={defaultJudges[task.stationId]}
          disabled={disabled || voided}
          judges={judgesFor(task.stationId)}
          key={taskKey(task)}
          label={compact ? t('results.column.task', { number: index + 1 }) : undefined}
          onChange={setTask}
          onJudgeChange={(item, judge) => {
            onJudgeChange(item.stationId, judge)
            writeTask(item, { judge })
          }}
          task={task}
          value={tasks.find((entry) => taskKey(entry) === taskKey(task))}
        />
      )),
    }
  }

  if (compact) {
    return (
      <Stack spacing={1}>
        {registrations.map((registration) => (
          <ResultCard
            controls={controlsFor(registration)}
            key={registration.id}
            qualitative={qualitative}
            registration={registration}
          />
        ))}
      </Stack>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell align="right">{t('results.column.number')}</TableCell>
            <TableCell>{t('results.column.dog')}</TableCell>
            <TableCell>{t('dog.regNo')}</TableCell>
            <TableCell>{t('results.column.handler')}</TableCell>
            {qualitative && <TableCell>{t('results.judge')}</TableCell>}
            {round.map((task, index) => (
              <TableCell align="center" key={taskKey(task)}>
                {t('results.column.task', { number: index + 1 })}
              </TableCell>
            ))}
            <TableCell>{t('results.column.outcome')}</TableCell>
            <TableCell align="right">{t('results.column.result')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {registrations.map((registration) => {
            const controls = controlsFor(registration)

            return (
              <TableRow hover key={registration.id}>
                <TableCell align="right">{registration.group?.number}</TableCell>
                <TableCell>{registration.dog.name}</TableCell>
                <TableCell>{registration.dog.regNo}</TableCell>
                <TableCell>{registration.handler?.name}</TableCell>
                {qualitative && <TableCell>{controls.judge}</TableCell>}
                {controls.tasks.map((task, index) => (
                  <TableCell align="center" key={taskKey(round[index])}>
                    {task}
                  </TableCell>
                ))}
                <TableCell>{controls.outcome}</TableCell>
                <TableCell align="right">{controls.result}</TableCell>
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
}

/**
 * A dog on a phone: who it is on top, the round's controls under it. A derived prize sits beside the
 * name where the eye lands first; an entered one is a control like the rest and takes its place below.
 */
const ResultCard = ({ registration, qualitative, controls }: CardProps) => {
  const identity = [registration.dog.regNo, registration.handler?.name].filter(Boolean).join(' · ')

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack alignItems="flex-start" direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600} lineHeight={1.3}>
            {registration.group?.number != null && `${registration.group.number}. `}
            {registration.dog.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {identity}
          </Typography>
        </Box>
        {!qualitative && <Box sx={{ flexShrink: 0, textAlign: 'right' }}>{controls.result}</Box>}
      </Stack>
      <Stack spacing={1.5}>
        {controls.judge}
        {controls.tasks.length > 0 && (
          <Stack direction="row" flexWrap="wrap" useFlexGap sx={{ columnGap: 1.5, rowGap: 1 }}>
            {controls.tasks}
          </Stack>
        )}
        {controls.outcome}
        {qualitative && controls.result}
      </Stack>
    </Paper>
  )
}

export default memo(ResultsTable)
