import type { StepIconProps } from '@mui/material/StepIcon'
import type { TFunction } from 'i18next'
import type { EventProgressStep } from '../../../lib/event'
import type { ConfirmedEvent } from '../../../types'
import CheckCircle from '@mui/icons-material/CheckCircle'
import Circle from '@mui/icons-material/Circle'
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked'
import Box from '@mui/material/Box'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import { useTranslation } from 'react-i18next'
import { EVENT_PROGRESS_PHASES, getEventProgress, isEntryOpen } from '../../../lib/event'

const CLASS_PROGRESS_PHASES = new Set<EventProgressStep>(['picked', 'invited'])

const PhaseStepIcon = ({ active, className, completed }: StepIconProps) => {
  let Icon = RadioButtonUnchecked
  if (completed) Icon = CheckCircle
  else if (active) Icon = Circle
  const stateClasses = [className, 'MuiStepIcon-root', active && 'Mui-active', completed && 'Mui-completed']
    .filter(Boolean)
    .join(' ')

  return <Icon className={stateClasses} />
}

const getEntryPhaseLabel = (entryCompleted: boolean, entryOpen: boolean, t: TFunction) => {
  if (entryCompleted) return t('event.states.confirmed_entryClosed')
  if (entryOpen) return t('event.states.confirmed_entryOpen')
  return t('entryUpcoming')
}

interface PhaseProgressOptions {
  completedClasses: Array<{ eventClass: string }>
  eventClasses: string[]
  phase: EventProgressStep
  publishedStartListClasses: string[]
  publishedStartNumbersClasses: string[]
  showClassProgress: boolean
  startListActionable: boolean
  startListClasses: string[]
  startNumbersActionable: boolean
  t: TFunction
}

const getPhaseProgressText = ({
  completedClasses,
  eventClasses,
  phase,
  publishedStartListClasses,
  publishedStartNumbersClasses,
  showClassProgress,
  startListActionable,
  startListClasses,
  startNumbersActionable,
  t,
}: PhaseProgressOptions) => {
  let classes: string[] = []
  let total = 0
  if (phase === 'startListPublished' && startListActionable && startListClasses.length > 1) {
    classes = publishedStartListClasses
    total = startListClasses.length
  } else if (phase === 'startNumbersPublished' && startNumbersActionable && startListClasses.length > 1) {
    classes = publishedStartNumbersClasses
    total = startListClasses.length
  } else if (showClassProgress) {
    classes = completedClasses.map(({ eventClass }) => eventClass)
    total = eventClasses.length
  }
  if (!total) return ''
  return ` (${t('event.classProgress', {
    classes: classes.length ? `: ${classes.join(', ')}` : '',
    completed: classes.length,
    total,
  })})`
}

const getPhaseLabel = (
  phase: EventProgressStep,
  entryCompleted: boolean,
  entryOpen: boolean,
  startListCompleted: boolean,
  startNumbersCompleted: boolean,
  resultsCompleted: boolean,
  t: TFunction
) => {
  if (phase === 'confirmed_entryOpen') return getEntryPhaseLabel(entryCompleted, entryOpen, t)
  // A publishing step reads as an instruction until it is done, and as a fact afterwards.
  if (phase === 'startListPublished') {
    return t(`event.states.${startListCompleted ? 'startListPublished' : 'publishStartList'}`)
  }
  if (phase === 'startNumbersPublished') {
    return t(`event.states.${startNumbersCompleted ? 'startNumbersPublished' : 'publishStartNumbers'}`)
  }
  if (phase === 'resultsPublished') {
    return t(`event.states.${resultsCompleted ? 'resultsPublished' : 'publishResults'}`)
  }
  return t(`event.states.${phase}`)
}

export default function EventStateStepper({ event }: { readonly event: ConfirmedEvent }) {
  const { t } = useTranslation()
  const {
    classPhases,
    entryStarted,
    eventClasses,
    publishedStartListClasses,
    publishedStartNumbersClasses,
    reachedPhaseIndex,
    resultsActionable,
    startListActionable,
    startListClasses,
    resultsCompleted,
    startListCompleted,
    startNumbersActionable,
    startNumbersCompleted,
    temporalPhaseIndex,
  } = getEventProgress(event)
  const entryOpen = isEntryOpen(event)

  return (
    <Box sx={{ flexShrink: 0, overflowX: 'auto', py: 1, width: '100%' }}>
      <Stepper
        activeStep={-1}
        alternativeLabel
        aria-label={t('event.phase')}
        role="list"
        sx={{
          '& .MuiStepConnector-line': {
            borderColor: 'grey.300',
            borderRadius: 1,
            borderTopWidth: 2,
          },
          '& .MuiStepConnector-root': { top: 10 },
          '& .MuiStepConnector-root.Mui-active .MuiStepConnector-line': { borderColor: 'warning.main' },
          '& .MuiStepConnector-root.Mui-completed .MuiStepConnector-line': { borderColor: 'success.main' },
          '& .MuiStepIcon-root': {
            '&.Mui-active': { color: 'warning.main', transform: 'scale(1.15)' },
            '&.Mui-completed': { color: 'success.main' },
            color: 'grey.400',
            fontSize: 20,
            transition: 'color 0.2s ease, transform 0.2s ease',
          },
          '& .MuiStepLabel-label': {
            fontSize: '0.75rem',
            mt: '4px !important',
          },
          minWidth: 760,
        }}
      >
        {EVENT_PROGRESS_PHASES.map((phase, index) => {
          const showClassProgress =
            eventClasses.length > 1 &&
            temporalPhaseIndex <= EVENT_PROGRESS_PHASES.indexOf('invited') &&
            CLASS_PROGRESS_PHASES.has(phase)
          const completedClasses = CLASS_PROGRESS_PHASES.has(phase)
            ? classPhases.filter(({ phaseIndex }) => phaseIndex >= index)
            : []
          const entryCompleted =
            phase === 'confirmed_entryOpen' && (reachedPhaseIndex > index || (entryStarted && !entryOpen))
          let completed = index <= reachedPhaseIndex
          if (phase === 'confirmed_entryOpen') completed = entryCompleted
          else if (phase === 'startListPublished') completed = startListCompleted
          else if (phase === 'startNumbersPublished') completed = startNumbersCompleted
          // The publishing state is the truth for this step, like the start list steps above: once
          // every class's results are out, the step is done even while 'ended' still waits (KOE-1292).
          else if (phase === 'resultsPublished') completed = resultsCompleted
          else if (showClassProgress) completed = completedClasses.length === eventClasses.length
          const active =
            (phase === 'confirmed_entryOpen' && entryOpen && !entryCompleted) ||
            (phase === 'startListPublished' && startListActionable && !startListCompleted) ||
            (phase === 'startNumbersPublished' && startNumbersActionable && !startNumbersCompleted) ||
            (phase === 'resultsPublished' && resultsActionable && !resultsCompleted) ||
            (showClassProgress && completedClasses.length > 0 && completedClasses.length < eventClasses.length)
          const label = getPhaseLabel(
            phase,
            entryCompleted,
            entryOpen,
            startListCompleted,
            startNumbersCompleted,
            resultsCompleted,
            t
          )
          const progressText = getPhaseProgressText({
            completedClasses,
            eventClasses,
            phase,
            publishedStartListClasses,
            publishedStartNumbersClasses,
            showClassProgress,
            startListActionable,
            startListClasses,
            startNumbersActionable,
            t,
          })

          return (
            <Step active={active} completed={completed} key={phase} role="listitem">
              <StepLabel slots={{ stepIcon: PhaseStepIcon }}>
                {label}
                {progressText}
              </StepLabel>
            </Step>
          )
        })}
      </Stepper>
    </Box>
  )
}
