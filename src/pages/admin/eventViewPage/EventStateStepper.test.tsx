import type { ConfirmedEventStates } from '../../../types'
import { render, screen } from '@testing-library/react'
import { eventWithEntryOpen, eventWithStaticDates, eventWithStaticDatesAnd3Classes } from '../../../__mockData__/events'
import EventStateStepper from './EventStateStepper'

describe('EventStateStepper', () => {
  it.each<Exclude<ConfirmedEventStates, 'confirmed' | 'completed'>>([
    'picked',
    'invited',
    'started',
    'ended',
  ])('marks %s as completed when the event has reached it', (state) => {
    render(<EventStateStepper event={{ ...eventWithEntryOpen, state }} />)

    expect(screen.getByRole('list', { name: 'event.phase' })).toBeInTheDocument()
    expect(screen.getByText(`event.states.${state}`).closest('.Mui-completed')).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument()
  })

  it('shows a legacy completed state as ended', () => {
    render(<EventStateStepper event={{ ...eventWithEntryOpen, state: 'completed' }} />)

    const endedStep = screen.getByText('event.states.ended').closest('[role="listitem"]')

    expect(endedStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(endedStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    expect(screen.queryByText('event.states.completed')).not.toBeInTheDocument()
  })

  it('shows entry as the current phase for a published event', () => {
    render(<EventStateStepper event={eventWithEntryOpen} />)

    expect(screen.getByText('event.states.confirmed_entryOpen').closest('.Mui-completed')).toBeInTheDocument()
    expect(screen.getByText('event.states.confirmed').closest('.Mui-completed')).toBeInTheDocument()
  })

  it('shows incomplete actionable phases for a multi-class event', () => {
    const event = {
      ...eventWithEntryOpen,
      classes: eventWithStaticDatesAnd3Classes.classes.map((eventClass) => ({
        ...eventClass,
        state: eventClass.class === 'ALO' || eventClass.class === 'AVO' ? ('invited' as const) : undefined,
      })),
    }

    render(<EventStateStepper event={event} />)

    const pickedStep = screen
      .getByText(/^event\.states\.picked/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')
    const invitedStep = screen
      .getByText(/^event\.states\.invited/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(invitedStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
    expect(pickedStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
    expect(pickedStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
    expect(pickedStep).toHaveTextContent('event.classProgress')
    expect(invitedStep).toHaveTextContent('event.classProgress')
  })

  it('uses the event dates when a historical state was not updated', () => {
    render(<EventStateStepper event={{ ...eventWithStaticDates, state: 'invited' }} />)

    const endedStep = screen.getByText('event.states.ended').closest('[role="listitem"]')

    expect(endedStep).not.toHaveAttribute('aria-current')
    expect(endedStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(endedStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    expect(screen.getByText('event.states.started').closest('.Mui-completed')).toBeInTheDocument()
  })
})
