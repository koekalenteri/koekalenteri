import type { RoundTask } from '../../../lib/results'
import type { EventResult, EventStation, NowtZeroFault, PublicJudge, Registration } from '../../../types'
import type { ResultEdit, TaskEdit } from './types'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { parseEventResultCode, scoresAtPosts } from '../../../lib/results'
import { JudgeCell } from './JudgeCell'
import { ResultCell } from './ResultCell'
import { RoundOutcomeCell } from './RoundOutcomeCell'
import { TaskCell } from './TaskCell'
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
            const edit = edits[registration.id] ?? seededEdit(registration.eventResult)
            const { tasks } = edit
            const voided = isVoided(edit)

            const writeTask = (task: RoundTask, changes: Partial<TaskEdit>) => {
              const existing = tasks.find((item) => taskKey(item) === taskKey(task))
              // Scoring a task attributes it to whoever is showing, so the secretary only touches the
              // judge control when it actually changes.
              const judge =
                changes.judge ?? existing?.judge ?? defaultJudges[task.stationId] ?? judgesFor(task.stationId)[0]

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

            return (
              <TableRow hover key={registration.id}>
                <TableCell align="right">{registration.group?.number}</TableCell>
                <TableCell>{registration.dog.name}</TableCell>
                <TableCell>{registration.dog.regNo}</TableCell>
                <TableCell>{registration.handler?.name}</TableCell>
                {qualitative && (
                  <JudgeCell
                    disabled={disabled}
                    judges={judges}
                    onChange={(judge) => {
                      onJudgeChange(EVENT_JUDGE_KEY, judge)
                      onChange(registration.id, { ...edit, ...(judge ? { judge } : {}) })
                    }}
                    value={edit.judge ?? defaultJudges[EVENT_JUDGE_KEY] ?? judges[0]}
                  />
                )}
                {round.map((task) => (
                  <TaskCell
                    defaultJudge={defaultJudges[task.stationId]}
                    disabled={disabled || voided}
                    judges={judgesFor(task.stationId)}
                    key={taskKey(task)}
                    onChange={setTask}
                    onJudgeChange={(item, judge) => {
                      onJudgeChange(item.stationId, judge)
                      writeTask(item, { judge })
                    }}
                    task={task}
                    value={tasks.find((entry) => taskKey(entry) === taskKey(task))}
                  />
                ))}
                <RoundOutcomeCell
                  disabled={disabled}
                  eventType={eventType}
                  stationId={stationId}
                  stations={stations}
                  onChange={(next) => onChange(registration.id, attributed(next))}
                  value={edit}
                />
                <ResultCell
                  disabled={disabled}
                  edit={edit}
                  eventClass={eventClass}
                  eventType={eventType}
                  onChange={(next) => onChange(registration.id, attributed(next))}
                  round={fullRound}
                  stored={registration.eventResult}
                />
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default memo(ResultsTable)
