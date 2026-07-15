import type { ConfirmedEvent, ConfirmedEventStates } from '../../../types'
import Box from '@mui/material/Box'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import { useTranslation } from 'react-i18next'
import { isEventOngoing, isEventOver } from '../../../lib/utils'

type EventPhase = Exclude<ConfirmedEventStates, 'completed'> | 'confirmed_entryOpen'

const EVENT_PHASES: readonly EventPhase[] = [
  'confirmed',
  'confirmed_entryOpen',
  'picked',
  'invited',
  'started',
  'ended',
]
const CLASS_PROGRESS_PHASES: readonly EventPhase[] = ['picked', 'invited']

const getPhaseIndex = (state: ConfirmedEventStates): number => {
  if (state === 'completed') return EVENT_PHASES.indexOf('ended')
  return EVENT_PHASES.indexOf(state === 'confirmed' ? 'confirmed_entryOpen' : state)
}

export default function EventStateStepper({ event }: { readonly event: ConfirmedEvent }) {
  const { t } = useTranslation()
  const eventClasses = [...new Set(event.classes.map((eventClass) => eventClass.class))]
  const classPhases = eventClasses.map((eventClass) => {
    const state = event.classes.find((item) => item.class === eventClass)?.state ?? event.state
    return { eventClass, phaseIndex: getPhaseIndex(state) }
  })
  const temporalPhaseIndex = isEventOver(event)
    ? EVENT_PHASES.indexOf('ended')
    : isEventOngoing(event)
      ? EVENT_PHASES.indexOf('started')
      : -1
  const reachedPhaseIndex = Math.max(
    getPhaseIndex(event.state),
    temporalPhaseIndex,
    ...classPhases.map(({ phaseIndex }) => phaseIndex)
  )

  return (
    <Box sx={{ overflowX: 'auto', py: 1, width: '100%' }}>
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
          '& .MuiStepConnector-root.Mui-active .MuiStepConnector-line': { borderColor: 'info.main' },
          '& .MuiStepConnector-root.Mui-completed .MuiStepConnector-line': { borderColor: 'success.main' },
          '& .MuiStepIcon-root': {
            '&.Mui-active': { color: 'info.main', transform: 'scale(1.15)' },
            '&.Mui-completed': { color: 'success.main' },
            color: 'grey.400',
            fontSize: 20,
            transition: 'color 0.2s ease, transform 0.2s ease',
          },
          '& .MuiStepLabel-label': {
            fontSize: '0.75rem',
            mt: '4px !important',
          },
          minWidth: 640,
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
          const completed = showClassProgress
            ? completedClasses.length === eventClasses.length
            : index <= reachedPhaseIndex
          const active =
            showClassProgress && completedClasses.length > 0 && completedClasses.length < eventClasses.length

          return (
            <Step active={active} completed={completed} key={phase} role="listitem">
              <StepLabel>
                {t(`event.states.${phase}`)}
                {showClassProgress
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
