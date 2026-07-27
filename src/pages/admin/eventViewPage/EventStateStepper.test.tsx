import type { ConfirmedEventStates } from '../../../types'
import { render, screen } from '@testing-library/react'
import {
  eventWithEntryNotYetOpen,
  eventWithEntryOpen,
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAnd3Classes,
} from '../../../__mockData__/events'
import EventStateStepper from './EventStateStepper'

describe('EventStateStepper', () => {
  it('does not shrink vertically when the event page runs out of space', () => {
    const { container } = render(<EventStateStepper event={eventWithEntryOpen} />)

    expect(container.firstChild).toHaveStyle({ flexShrink: 0 })
  })

  it.each<Exclude<ConfirmedEventStates, 'confirmed' | 'completed'>>(['picked', 'invited', 'started', 'ended'])(
    'marks %s as completed when the event has reached it',
    (state) => {
      render(<EventStateStepper event={{ ...eventWithEntryOpen, state }} />)

      expect(screen.getByRole('list', { name: 'event.phase' })).toBeInTheDocument()
      expect(screen.getByText(`event.states.${state}`).closest('.Mui-completed')).toBeInTheDocument()
      expect(screen.queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument()
    }
  )

  it('shows a legacy completed state as ended', () => {
    render(<EventStateStepper event={{ ...eventWithEntryOpen, state: 'completed' }} />)

    const endedStep = screen.getByText('event.states.ended').closest('[role="listitem"]')

    expect(endedStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(endedStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    expect(screen.queryByText('event.states.completed')).not.toBeInTheDocument()
  })

  it('shows entry as the current phase for a published event', () => {
    const { container } = render(<EventStateStepper event={eventWithEntryOpen} />)

    const entryStep = screen.getByText('event.states.confirmed_entryOpen').closest('[role="listitem"]')

    expect(entryStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
    expect(entryStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
    expect(screen.getByText('event.states.confirmed').closest('.Mui-completed')).toBeInTheDocument()
    expect(container.querySelector('.MuiStepIcon-text')).not.toBeInTheDocument()
  })

  it('does not show entry as started before the entry start date', () => {
    render(<EventStateStepper event={eventWithEntryNotYetOpen} />)

    expect(screen.getByText('event.states.confirmed').closest('.Mui-completed')).toBeInTheDocument()
    const entryStep = screen.getByText('entryUpcoming').closest('[role="listitem"]')

    expect(entryStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    expect(entryStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('does not show start list progress before publishing is available', () => {
    render(<EventStateStepper event={{ ...eventWithParticipantsInvited, state: 'confirmed' }} />)

    const startListStep = screen.getByText('event.states.publishStartList').closest('[role="listitem"]')

    expect(startListStep).not.toHaveTextContent('event.classProgress')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('shows entry as completed after the entry end date', () => {
    render(<EventStateStepper event={eventWithStaticDates} />)

    const entryStep = screen.getByText('event.states.confirmed_entryClosed').closest('[role="listitem"]')

    expect(entryStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(entryStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
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

  it('shows start list publishing as an incomplete actionable phase', () => {
    render(<EventStateStepper event={{ ...eventWithParticipantsInvited, startListPublished: false }} />)

    const startListStep = screen
      .getByText(/^event\.states\.publishStartList/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('shows class progress when only some start lists are published', () => {
    render(
      <EventStateStepper event={{ ...eventWithParticipantsInvited, startListPublished: { ALO: true, AVO: false } }} />
    )

    const startListStep = screen
      .getByText(/^event\.states\.publishStartList/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep).toHaveTextContent('event.classProgress')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
  })

  it('shows start list publishing as completed when all start lists are published', () => {
    render(<EventStateStepper event={eventWithParticipantsInvited} />)

    const startListStep = screen
      .getByText(/^event\.states\.startListPublished/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
  })

  it('treats a missing start list field as published for a historical event with a stale state', () => {
    render(<EventStateStepper event={{ ...eventWithStaticDates, startListPublished: undefined, state: 'picked' }} />)

    const startListStep = screen
      .getByText(/^event\.states\.startListPublished/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
  })

  it('keeps an explicitly hidden historical start list unpublished', () => {
    render(<EventStateStepper event={{ ...eventWithStaticDates, startListPublished: false, state: 'picked' }} />)

    const startListStep = screen
      .getByText(/^event\.states\.publishStartList/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
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
