import type { RoundTask } from '../../../lib/results'
import type { NowtZeroFault, Registration } from '../../../types'
import type { TaskEdit } from './types'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { ResultCell } from './ResultCell'
import { TaskCell } from './TaskCell'

interface Props {
  readonly registrations: Registration[]
  /** The scored slots this view covers: the whole round, or one post's. */
  readonly round: RoundTask[]
  /** The whole class round, for deriving the prize. Absent in a post's own view, where it is unknowable. */
  readonly fullRound?: RoundTask[]
  readonly eventType: string
  readonly eventClass?: string
  readonly edits: Record<string, TaskEdit[]>
  readonly disabled?: boolean
  readonly onChange: (registrationId: string, tasks: TaskEdit[]) => void
}

const taskKey = (task: { stationId: string; index: number }) => `${task.stationId}#${task.index}`

/**
 * One table serving both the event secretary and a station secretary. They differ only in which slots
 * are in scope — the whole round, or one post's one or two — so the difference is a prop, not a screen.
 */
function ResultsTable({ registrations, round, fullRound, eventType, eventClass, edits, disabled, onChange }: Props) {
  const { t } = useTranslation()

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell align="right">{t('results.column.number')}</TableCell>
            <TableCell>{t('results.column.dog')}</TableCell>
            <TableCell>{t('results.column.handler')}</TableCell>
            {round.map((task, index) => (
              <TableCell align="center" key={taskKey(task)}>
                {t('results.column.task', { number: index + 1 })}
              </TableCell>
            ))}
            <TableCell align="right">{t('results.column.result')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {registrations.map((registration) => {
            const tasks = edits[registration.id] ?? []

            const setTask = (task: RoundTask, points: number | null, zeroFault?: NowtZeroFault) =>
              onChange(registration.id, [
                ...tasks.filter((item) => taskKey(item) !== taskKey(task)),
                { index: task.index, points, stationId: task.stationId, ...(zeroFault ? { zeroFault } : {}) },
              ])

            return (
              <TableRow hover key={registration.id}>
                <TableCell align="right">{registration.group?.number}</TableCell>
                <TableCell>{registration.dog.name}</TableCell>
                <TableCell>{registration.handler?.name}</TableCell>
                {round.map((task) => (
                  <TaskCell
                    disabled={disabled}
                    key={taskKey(task)}
                    onChange={setTask}
                    task={task}
                    value={tasks.find((item) => taskKey(item) === taskKey(task))}
                  />
                ))}
                <ResultCell
                  eventClass={eventClass}
                  eventType={eventType}
                  round={fullRound}
                  stored={registration.eventResult}
                  tasks={tasks}
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
