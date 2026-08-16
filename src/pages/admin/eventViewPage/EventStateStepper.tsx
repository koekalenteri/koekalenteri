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

export default function EventStateStepper({ event }: { readonly event: ConfirmedEvent }) {
  const { t } = useTranslation()
  const {
    classPhases,
    entryStarted,
    eventClasses,
    publishedStartListClasses,
    reachedPhaseIndex,
    startListActionable,
    startListClasses,
    startListCompleted,
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
          else if (showClassProgress) completed = completedClasses.length === eventClasses.length
          const active =
            (phase === 'confirmed_entryOpen' && entryOpen && !entryCompleted) ||
            (phase === 'startListPublished' && startListActionable && !startListCompleted) ||
            (showClassProgress && completedClasses.length > 0 && completedClasses.length < eventClasses.length)
          let label = t(`event.states.${phase}`)
          if (phase === 'confirmed_entryOpen') {
            label = getEntryPhaseLabel(entryCompleted, entryOpen, t)
          } else if (phase === 'startListPublished') {
            label = t(`event.states.${startListCompleted ? 'startListPublished' : 'publishStartList'}`)
          }
          let progressText = ''
          if (phase === 'startListPublished' && startListActionable && startListClasses.length > 1) {
            progressText = ` (${t('event.classProgress', {
              classes: publishedStartListClasses.length ? `: ${publishedStartListClasses.join(', ')}` : '',
              completed: publishedStartListClasses.length,
              total: startListClasses.length,
            })})`
          } else if (showClassProgress) {
            progressText = ` (${t('event.classProgress', {
              classes: completedClasses.length
                ? `: ${completedClasses.map(({ eventClass }) => eventClass).join(', ')}`
                : '',
              completed: completedClasses.length,
              total: eventClasses.length,
            })})`
          }

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
