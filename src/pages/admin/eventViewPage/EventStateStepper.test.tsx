import type { ReactElement } from 'react'
import type { ConfirmedEventStates, EventType } from '@/types'
import { render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import {
  eventWithEntryNotYetOpen,
  eventWithEntryOpen,
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAnd3Classes,
} from '@/__mockData__/events'
import { flushPromises } from '@/test-utils/utils'
import { adminEventTypesAtom } from '../state'
import EventStateStepper from './EventStateStepper'

/** The steps ask the event types, which load on first use, whether the results go to Kennelliitto. */
const renderStepper = async (ui: ReactElement) => {
  const result = render(ui)
  await flushPromises(false)
  return result
}

describe('EventStateStepper', () => {
  it('does not shrink vertically when the event page runs out of space', async () => {
    const { container } = await renderStepper(<EventStateStepper event={eventWithEntryOpen} />)

    expect(container.firstChild).toHaveStyle({ flexShrink: '0' })
  })

  /**
   * The strip scrolls sideways when it does not fit, and everything in it is plain text and icons —
   * nothing to tab to. Unless the strip itself takes focus, its right-hand end cannot be reached
   * without a mouse or a touch screen (KOE-1427).
   */
  it('takes focus itself, so its scrolling end can be reached without a pointer', async () => {
    await renderStepper(<EventStateStepper event={eventWithEntryOpen} />)

    const strip = screen.getByRole('list', { name: 'event.phase' })
    expect(strip).toHaveAttribute('tabindex', '0')
    expect(strip).toHaveStyle({ overflowX: 'auto' })
  })

  it.each<Exclude<ConfirmedEventStates, 'confirmed' | 'completed'>>(['picked', 'invited', 'started', 'ended'])(
    'marks %s as completed when the event has reached it',
    async (state) => {
      await renderStepper(<EventStateStepper event={{ ...eventWithEntryOpen, state }} />)

      expect(screen.getByRole('list', { name: 'event.phase' })).toBeInTheDocument()
      expect(screen.getByText(`event.states.${state}`).closest('.Mui-completed')).toBeInTheDocument()
      expect(screen.queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument()
    }
  )

  it('shows a legacy completed state as ended', async () => {
    await renderStepper(<EventStateStepper event={{ ...eventWithEntryOpen, state: 'completed' }} />)

    const endedStep = screen.getByText('event.states.ended').closest('[role="listitem"]')

    expect(endedStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(endedStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    expect(screen.queryByText('event.states.completed')).not.toBeInTheDocument()
  })

  it('shows entry as the current phase for a published event', async () => {
    const { container } = await renderStepper(<EventStateStepper event={eventWithEntryOpen} />)

    const entryStep = screen.getByText('event.states.confirmed_entryOpen').closest('[role="listitem"]')

    expect(entryStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
    expect(entryStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
    expect(screen.getByText('event.states.confirmed').closest('.Mui-completed')).toBeInTheDocument()
    expect(container.querySelector('.MuiStepIcon-text')).not.toBeInTheDocument()
  })

  it('does not show entry as started before the entry start date', async () => {
    await renderStepper(<EventStateStepper event={eventWithEntryNotYetOpen} />)

    expect(screen.getByText('event.states.confirmed').closest('.Mui-completed')).toBeInTheDocument()
    const entryStep = screen.getByText('entryUpcoming').closest('[role="listitem"]')

    expect(entryStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    expect(entryStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('does not show start list progress before publishing is available', async () => {
    await renderStepper(<EventStateStepper event={{ ...eventWithParticipantsInvited, state: 'confirmed' }} />)

    const startListStep = screen.getByText('event.states.publishStartList').closest('[role="listitem"]')

    expect(startListStep).not.toHaveTextContent('event.classProgress')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('shows entry as completed after the entry end date', async () => {
    await renderStepper(<EventStateStepper event={eventWithStaticDates} />)

    const entryStep = screen.getByText('event.states.confirmed_entryClosed').closest('[role="listitem"]')

    expect(entryStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(entryStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
  })

  it('shows incomplete actionable phases for a multi-class event', async () => {
    const event = {
      ...eventWithEntryOpen,
      classes: eventWithStaticDatesAnd3Classes.classes.map((eventClass) => ({
        ...eventClass,
        state: eventClass.class === 'ALO' || eventClass.class === 'AVO' ? ('invited' as const) : undefined,
      })),
    }

    await renderStepper(<EventStateStepper event={event} />)

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

  it('shows start list publishing as an incomplete actionable phase', async () => {
    await renderStepper(<EventStateStepper event={{ ...eventWithParticipantsInvited, startListPublished: false }} />)

    const startListStep = screen
      .getByText(/^event\.states\.publishStartList/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('shows class progress when only some start lists are published', async () => {
    await renderStepper(
      <EventStateStepper event={{ ...eventWithParticipantsInvited, startListPublished: { ALO: true, AVO: false } }} />
    )

    const startListStep = screen
      .getByText(/^event\.states\.publishStartList/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep).toHaveTextContent('event.classProgress')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
  })

  it('shows start list publishing as completed when all start lists are published', async () => {
    await renderStepper(<EventStateStepper event={eventWithParticipantsInvited} />)

    const startListStep = screen
      .getByText(/^event\.states\.startListPublished/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
  })

  it('shows start numbers publishing as an incomplete actionable phase', async () => {
    await renderStepper(<EventStateStepper event={{ ...eventWithParticipantsInvited, startNumbersPublished: false }} />)

    const numbersStep = screen
      .getByText(/^event\.states\.publishStartNumbers/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(numbersStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
    expect(numbersStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('shows class progress when only some start numbers are published', async () => {
    await renderStepper(
      <EventStateStepper
        event={{ ...eventWithParticipantsInvited, startNumbersPublished: { ALO: true, AVO: false } }}
      />
    )

    const numbersStep = screen
      .getByText(/^event\.states\.publishStartNumbers/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(numbersStep).toHaveTextContent('event.classProgress')
    expect(numbersStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
  })

  it('treats missing start number publishing as completed for a legacy event', async () => {
    await renderStepper(<EventStateStepper event={eventWithParticipantsInvited} />)

    const numbersStep = screen
      .getByText(/^event\.states\.startNumbersPublished/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(numbersStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(numbersStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
  })

  it('treats a missing start list field as published for a historical event the workflow invited', async () => {
    await renderStepper(
      <EventStateStepper event={{ ...eventWithStaticDates, startListPublished: undefined, state: 'invited' }} />
    )

    const startListStep = screen
      .getByText(/^event\.states\.startListPublished/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
  })

  /**
   * A past trial whose invitations were never sent has no published list, whatever its date: the public
   * list stays hidden and the panel offers to publish it, so the step waits on that publish rather than
   * claiming it — and the numbers riding on the list with it (KOE-1465).
   */
  it('waits on the start list of a past trial that never sent invitations', async () => {
    await renderStepper(
      <EventStateStepper event={{ ...eventWithStaticDates, startListPublished: undefined, state: 'picked' }} />
    )

    const startListStep = screen
      .getByText(/^event\.states\.publishStartList/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')
    const numbersStep = screen
      .getByText(/^event\.states\.publishStartNumbers/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
    expect(startListStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
    expect(numbersStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('keeps an explicitly hidden historical start list unpublished', async () => {
    await renderStepper(
      <EventStateStepper event={{ ...eventWithStaticDates, startListPublished: false, state: 'picked' }} />
    )

    const startListStep = screen
      .getByText(/^event\.states\.publishStartList/, { selector: '.MuiStepLabel-label' })
      .closest('[role="listitem"]')

    expect(startListStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('uses the event dates when a historical state was not updated', async () => {
    await renderStepper(<EventStateStepper event={{ ...eventWithStaticDates, state: 'invited' }} />)

    const endedStep = screen.getByText('event.states.ended').closest('[role="listitem"]')

    expect(endedStep).not.toHaveAttribute('aria-current')
    expect(endedStep?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
    expect(endedStep?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    expect(screen.getByText('event.states.started').closest('.Mui-completed')).toBeInTheDocument()
  })

  describe('the results step', () => {
    const ended = { ...eventWithStaticDates, startListPublished: true, state: 'ended' as const }
    const resultsStep = (label: string) =>
      screen.getByText(label, { selector: '.MuiStepLabel-label' }).closest('[role="listitem"]')

    it('is done once the results of the trial are published', async () => {
      await renderStepper(<EventStateStepper event={{ ...ended, resultsPublished: true }} />)

      const step = resultsStep('event.states.resultsPublished')
      expect(step?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
      expect(step?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
    })

    it('asks for the publishing of an ended trial with nothing published', async () => {
      await renderStepper(<EventStateStepper event={{ ...ended, resultsPublished: false }} />)

      const step = resultsStep('event.states.publishResults')
      expect(step?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
      expect(step?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
    })
  })

  describe('the Kennelliitto hand-over step (KOE-1579)', () => {
    const ended = { ...eventWithStaticDates, state: 'ended' as const }
    const handOverStep = (label: string) =>
      screen.getByText(label, { selector: '.MuiStepLabel-label' }).closest('[role="listitem"]')

    it('asks for the sending once the trial is over', async () => {
      await renderStepper(<EventStateStepper event={ended} />)

      const step = handOverStep('event.states.sendResultsToKennelliitto')
      expect(screen.getAllByRole('listitem').at(-1)).toBe(step)
      expect(step?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
      expect(step?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
    })

    it('is not active before results can be entered', async () => {
      await renderStepper(<EventStateStepper event={eventWithEntryOpen} />)

      const step = handOverStep('event.states.sendResultsToKennelliitto')
      expect(step?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
      expect(step?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
    })

    it('is done once the trial is with the chief judge, whatever else is left', async () => {
      await renderStepper(
        <EventStateStepper event={{ ...ended, kcState: { code: 1253, name: 'x', readAt: new Date() } }} />
      )

      const step = handOverStep('event.states.resultsHandedOver')
      expect(step?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')
      expect(step?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-active')
      // Handing over does not publish the results.
      expect(screen.getByText('event.states.publishResults')).toBeInTheDocument()
    })

    it('is not done while Kennelliitto has the trial open, say after the judge sent it back', async () => {
      await renderStepper(
        <EventStateStepper event={{ ...ended, kcState: { code: 754, name: 'x', readAt: new Date() } }} />
      )

      const step = handOverStep('event.states.sendResultsToKennelliitto')
      expect(step?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-active')
      expect(step?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
    })

    it('is not there for a trial whose results do not go to Kennelliitto', async () => {
      await renderStepper(<EventStateStepper event={{ ...ended, eventType: 'TEST1' }} />)

      expect(screen.queryByText('event.states.sendResultsToKennelliitto')).not.toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(9)
    })

    it('is there for an event type the Kennel Club knows, though not one of the built-in ones', async () => {
      const eventType: EventType = {
        active: true,
        createdAt: new Date(),
        createdBy: 'test',
        description: { en: '', fi: '', sv: '' },
        eventType: 'TEST1',
        modifiedAt: new Date(),
        modifiedBy: 'test',
        official: true,
      }
      const store = createStore()
      void store.set(adminEventTypesAtom, [eventType])

      await renderStepper(
        <Provider store={store}>
          <EventStateStepper event={{ ...ended, eventType: 'TEST1' }} />
        </Provider>
      )

      expect(handOverStep('event.states.sendResultsToKennelliitto')).toBeInTheDocument()
    })
  })
})
