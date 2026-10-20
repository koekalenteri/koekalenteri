import type { StepIconProps } from '@mui/material/StepIcon'
import type { TFunction } from 'i18next'
import type { EventProgressStep } from '@/lib/event'
import type { ConfirmedEvent } from '@/types'
import CheckCircle from '@mui/icons-material/CheckCircle'
import Circle from '@mui/icons-material/Circle'
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import { useTranslation } from 'react-i18next'
import { EVENT_PROGRESS_PHASES, getEventProgress, isEntryOpen } from '@/lib/event'
import { isResultsLocked } from '@/lib/kennelliittoResults'
import { useIsOfficialEventType } from '../hooks/useIsOfficialEventType'

/** Two short words side by side, or one long one on two lines: what a phase label needs. */
const STEP_MIN_WIDTH = 84

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

interface PhaseLabelOptions {
  entryCompleted: boolean
  entryOpen: boolean
  kennelliittoCompleted: boolean
  resultsCompleted: boolean
  startListCompleted: boolean
  startNumbersCompleted: boolean
}

const getPhaseLabel = (
  phase: EventProgressStep,
  {
    entryCompleted,
    entryOpen,
    kennelliittoCompleted,
    resultsCompleted,
    startListCompleted,
    startNumbersCompleted,
  }: PhaseLabelOptions,
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
  if (phase === 'resultsHandedOver') {
    return t(`event.states.${kennelliittoCompleted ? 'resultsHandedOver' : 'sendResultsToKennelliitto'}`)
  }
  return t(`event.states.${phase}`)
}

export default function EventStateStepper({ event }: { readonly event: ConfirmedEvent }) {
  const { t } = useTranslation()
  // Only a trial whose results go to Kennelliitto has the hand-over as its last step (KOE-1579).
  const official = useIsOfficialEventType(event.eventType)
  const {
    classPhases,
    entryStarted,
    eventClasses,
    kennelliittoActionable,
    kennelliittoCompleted,
    phases,
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
  } = getEventProgress(event, new Date(), official ? { handedOver: isResultsLocked(event) } : undefined)
  const entryOpen = isEntryOpen(event)

  return (
    // Nine or ten phases do not fit a phone, and stacking them would spend rows on the page that has least
    // of them to spare, so the strip scrolls. A scrolling strip of plain text and icons holds nothing
    // to tab to, though, which left a keyboard or screen reader user unable to reach its right-hand
    // end at all (KOE-1427). The list itself scrolls and takes the focus — one element that is the
    // phases, is named, and can be moved with the arrow keys, rather than a wrapper around them.
    <Stepper
      activeStep={-1}
      alternativeLabel
      aria-label={t('event.phase')}
      role="list"
      tabIndex={0}
      sx={{
        // The minimum belongs to the steps, not to the strip: a strip that cannot go below the
        // steps' width never has anything to scroll, and pokes out of the page instead.
        '& .MuiStep-root': { minWidth: STEP_MIN_WIDTH },
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
        flexShrink: 0,
        overflowX: 'auto',
        py: 1,
        width: '100%',
      }}
    >
      {phases.map((phase, index) => {
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
        // Handed to the chief judge is the only thing that finishes it; every dog sent does not.
        else if (phase === 'resultsHandedOver') completed = kennelliittoCompleted
        else if (showClassProgress) completed = completedClasses.length === eventClasses.length
        const active =
          (phase === 'confirmed_entryOpen' && entryOpen && !entryCompleted) ||
          (phase === 'startListPublished' && startListActionable && !startListCompleted) ||
          (phase === 'startNumbersPublished' && startNumbersActionable && !startNumbersCompleted) ||
          (phase === 'resultsPublished' && resultsActionable && !resultsCompleted) ||
          (phase === 'resultsHandedOver' && kennelliittoActionable) ||
          (showClassProgress && completedClasses.length > 0 && completedClasses.length < eventClasses.length)
        const label = getPhaseLabel(
          phase,
          {
            entryCompleted,
            entryOpen,
            kennelliittoCompleted,
            resultsCompleted,
            startListCompleted,
            startNumbersCompleted,
          },
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
  )
}
