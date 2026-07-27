import type { StepIconProps } from '@mui/material/StepIcon'
import type { ConfirmedEvent, ConfirmedEventStates } from '../../../types'
import CheckCircle from '@mui/icons-material/CheckCircle'
import Circle from '@mui/icons-material/Circle'
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked'
import Box from '@mui/material/Box'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import { useTranslation } from 'react-i18next'
import { canPublishStartList, isStartListPublishedForClass } from '../../../lib/event'
import { hasEntryStarted, isEntryOpen, isEventOngoing, isEventOver } from '../../../lib/utils'

type EventPhase = Exclude<ConfirmedEventStates, 'completed'> | 'confirmed_entryOpen' | 'startListPublished'

const EVENT_PHASES: readonly EventPhase[] = [
  'confirmed',
  'confirmed_entryOpen',
  'picked',
  'invited',
  'startListPublished',
  'started',
  'ended',
]
const CLASS_PROGRESS_PHASES: readonly EventPhase[] = ['picked', 'invited']

const PhaseStepIcon = ({ active, className, completed }: StepIconProps) => {
  const Icon = completed ? CheckCircle : active ? Circle : RadioButtonUnchecked
  const stateClasses = [className, 'MuiStepIcon-root', active && 'Mui-active', completed && 'Mui-completed']
    .filter(Boolean)
    .join(' ')

  return <Icon className={stateClasses} />
}

const getPhaseIndex = (state: ConfirmedEventStates, entryStarted: boolean): number => {
  if (state === 'completed') return EVENT_PHASES.indexOf('ended')
  if (state === 'confirmed') return EVENT_PHASES.indexOf(entryStarted ? 'confirmed_entryOpen' : 'confirmed')
  return EVENT_PHASES.indexOf(state)
}

export default function EventStateStepper({ event }: { readonly event: ConfirmedEvent }) {
  const { t } = useTranslation()
  const entryStarted = hasEntryStarted(event)
  const eventClasses = [...new Set(event.classes.map((eventClass) => eventClass.class))]
  const startListClasses = eventClasses.length ? eventClasses : [event.eventType]
  const classPhases = eventClasses.map((eventClass) => {
    const state = event.classes.find((item) => item.class === eventClass)?.state ?? event.state
    return { eventClass, phaseIndex: getPhaseIndex(state, entryStarted) }
  })
  const temporalPhaseIndex = isEventOver(event)
    ? EVENT_PHASES.indexOf('ended')
    : isEventOngoing(event)
      ? EVENT_PHASES.indexOf('started')
      : -1
  const legacyStartListPublished =
    event.startListPublished === undefined && temporalPhaseIndex >= EVENT_PHASES.indexOf('started')
  const publishableStartListClasses = startListClasses.filter((eventClass) => {
    const state = event.classes.find((item) => item.class === eventClass)?.state ?? event.state
    return canPublishStartList(state)
  })
  const publishedStartListClasses = legacyStartListPublished
    ? startListClasses
    : publishableStartListClasses.filter((eventClass) => isStartListPublishedForClass(event, eventClass))
  const startListActionable = legacyStartListPublished || publishableStartListClasses.length > 0
  const startListCompleted = startListActionable && publishedStartListClasses.length === startListClasses.length
  const reachedPhaseIndex = Math.max(
    getPhaseIndex(event.state, entryStarted),
    temporalPhaseIndex,
    ...classPhases.map(({ phaseIndex }) => phaseIndex)
  )
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
        {EVENT_PHASES.map((phase, index) => {
          const showClassProgress =
            eventClasses.length > 1 &&
            temporalPhaseIndex <= EVENT_PHASES.indexOf('invited') &&
            CLASS_PROGRESS_PHASES.includes(phase)
          const completedClasses = CLASS_PROGRESS_PHASES.includes(phase)
            ? classPhases.filter(({ phaseIndex }) => phaseIndex >= index)
            : []
          const entryCompleted =
            phase === 'confirmed_entryOpen' && (reachedPhaseIndex > index || (entryStarted && !entryOpen))
          const completed =
            phase === 'confirmed_entryOpen'
              ? entryCompleted
              : phase === 'startListPublished'
                ? startListCompleted
                : showClassProgress
                  ? completedClasses.length === eventClasses.length
                  : index <= reachedPhaseIndex
          const active =
            (phase === 'confirmed_entryOpen' && entryOpen && !entryCompleted) ||
            (phase === 'startListPublished' && startListActionable && !startListCompleted) ||
            (showClassProgress && completedClasses.length > 0 && completedClasses.length < eventClasses.length)
          const label =
            phase === 'confirmed_entryOpen'
              ? entryCompleted
                ? t('event.states.confirmed_entryClosed')
                : entryOpen
                  ? t('event.states.confirmed_entryOpen')
                  : t('entryUpcoming')
              : phase === 'startListPublished'
                ? t(`event.states.${startListCompleted ? 'startListPublished' : 'publishStartList'}`)
                : t(`event.states.${phase}`)

          return (
            <Step active={active} completed={completed} key={phase} role="listitem">
              <StepLabel slots={{ stepIcon: PhaseStepIcon }}>
                {label}
                {phase === 'startListPublished' && startListActionable && startListClasses.length > 1
                  ? ` (${t('event.classProgress', {
                      classes: publishedStartListClasses.length ? `: ${publishedStartListClasses.join(', ')}` : '',
                      completed: publishedStartListClasses.length,
                      total: startListClasses.length,
                    })})`
                  : showClassProgress
                    ? ` (${t('event.classProgress', {
                        classes: completedClasses.length
                          ? `: ${completedClasses.map(({ eventClass }) => eventClass).join(', ')}`
                          : '',
                        completed: completedClasses.length,
                        total: eventClasses.length,
                      })})`
                    : ''}
              </StepLabel>
            </Step>
          )
        })}
      </Stepper>
    </Box>
  )
}
