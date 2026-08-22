import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { Registration } from '../../../../types'
import { screen } from '@testing-library/react'
import { Provider } from 'jotai'
import {
  eventWithEntryClosed,
  eventWithEntryOpen,
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAndClass,
} from '../../../../__mockData__/events'
import {
  registrationsToEventWithEntryClosed,
  registrationsToEventWithParticipantsInvited,
  registrationWithStaticDates,
} from '../../../../__mockData__/registrations'
import { eventRegistrationDateKey } from '../../../../lib/event'
import { renderWithUserEvents, TEST_ID_TOKEN } from '../../../../test-utils/utils'
import InfoPanel from '../InfoPanel'

const _activeEventWithStaticDates = {
  ...eventWithStaticDates,
  endDate: new Date('2099-12-31'),
}
const _activeEventWithStaticDatesAndClass = {
  ...eventWithStaticDatesAndClass,
  endDate: new Date('2099-12-31'),
}

// Mock the API calls
vi.mock('../../../../api/event')
vi.mock('../../../../api/user')

// Mock the notistack enqueueSnackbar
vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

function _getGroupKey(r: Registration, i: number) {
  if (r.cancelled) return 'cancelled'
  if (i === 0) return 'reserve'
  return eventRegistrationDateKey(r.dates[0])
}

async function openInfoPanel(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'eventManagement.open' }))
}

describe('InfoPanel>', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })

  afterAll(() => localStorage.removeItem('idToken'))

  it('collapses when clicking outside the drawer', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: Provider,
    })
    await openInfoPanel(user)

    expect(screen.getByText('eventManagement.participantSelection.title')).toBeInTheDocument()

    const backdrop = document.querySelector('.MuiBackdrop-root')
    if (!backdrop) throw new Error('drawer backdrop not found')

    await user.click(backdrop)

    expect(screen.queryByText('eventManagement.participantSelection.title')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.open' })).toBeInTheDocument()
  })

  it('disables message buttons when there are no participants', async () => {
    // Create a test scenario with no participants in a class
    const emptyRegistrations: Registration[] = []

    const { user } = renderWithUserEvents(
      <InfoPanel event={eventWithEntryClosed} registrations={emptyRegistrations} />,
      {
        wrapper: Provider,
      }
    )
    await openInfoPanel(user)

    // All message buttons should be disabled
    const buttons = screen
      .getAllByRole('button')
      .filter((button) => /eventManagement\.(invitation|participantSelection)/.test(button.textContent ?? ''))

    buttons.forEach((button) => {
      expect(button).toBeDisabled()
    })
  })

  it('disables message buttons when participants are not confirmed', async () => {
    // Create a test scenario with participants that are not confirmed
    const unconfirmedRegistrations = registrationsToEventWithEntryClosed.map((r) => ({
      ...r,
      confirmed: false,
    }))

    const { user } = renderWithUserEvents(
      <InfoPanel event={eventWithEntryClosed} registrations={unconfirmedRegistrations} />,
      {
        wrapper: Provider,
      }
    )
    await openInfoPanel(user)

    // The message buttons for participants should be disabled
    const participantButtons = screen.getAllByText(
      /eventManagement\.(invitation\.send|participantSelection\.sendPlaceNotification)/
    )

    participantButtons.forEach((button) => {
      expect(button).toBeDisabled()
    })
  })

  it('explains when place confirmations can be sent before the registration period is over', async () => {
    const event = {
      ...eventWithEntryOpen,
      classes: [{ class: 'VOI' as const, date: eventWithEntryOpen.startDate, places: 3 }],
      state: 'confirmed' as const,
    }
    const registrations = [
      {
        ...registrationWithStaticDates,
        class: 'VOI' as const,
        eventId: event.id,
        eventType: event.eventType,
        group: { date: event.startDate, key: 'VOI', number: 1 },
      },
    ]
    const { user } = renderWithUserEvents(<InfoPanel event={event} registrations={registrations} />, {
      wrapper: Provider,
    })
    await openInfoPanel(user)

    expect(screen.getByText('eventManagement.participantSelection.canSendAfterEntry')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'eventManagement.participantSelection.sendPlaceNotification' })
    ).not.toBeInTheDocument()
  })

  it('explains when reserve notifications can be sent before the registration period is over', async () => {
    const event = {
      ...eventWithEntryOpen,
      classes: [{ class: 'VOI' as const, date: eventWithEntryOpen.startDate, places: 3 }],
      state: 'confirmed' as const,
    }
    const registrations = [
      {
        ...registrationWithStaticDates,
        class: 'VOI' as const,
        eventId: event.id,
        eventType: event.eventType,
      },
    ]
    const { user } = renderWithUserEvents(<InfoPanel event={event} registrations={registrations} />, {
      wrapper: Provider,
    })
    await openInfoPanel(user)

    expect(screen.getByText('eventManagement.participantSelection.reserveCanSendAfterEntry')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'eventManagement.participantSelection.sendReserveNotification' })
    ).not.toBeInTheDocument()
  })

  it('allows sending reserve notifications after the registration period is over', async () => {
    const event = {
      ...eventWithEntryClosed,
      classes: eventWithEntryClosed.classes.filter((eventClass) => eventClass.class === 'ALO'),
    }
    const registrations = [registrationsToEventWithEntryClosed[0]]
    const { user } = renderWithUserEvents(<InfoPanel event={event} registrations={registrations} />, {
      wrapper: Provider,
    })
    await openInfoPanel(user)

    expect(
      screen.getByRole('button', { name: 'eventManagement.participantSelection.sendReserveNotification' })
    ).toBeEnabled()
    expect(screen.queryByText('eventManagement.participantSelection.reserveCanSendAfterEntry')).not.toBeInTheDocument()
  })

  it('does not allow resending invitations when attachment has not changed', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{
          ...eventWithParticipantsInvited,
          classes: eventWithParticipantsInvited.classes.map((eventClass) =>
            eventClass.class === 'AVO' ? { ...eventClass, places: 3 } : eventClass
          ),
          invitationAttachments: { ALO: 'alo-key' },
        }}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          invitationAttachmentSent: registration.class === 'ALO' ? 'alo-key' : undefined,
          messagesSent: { invitation: true },
        }))}
      />,
      {
        wrapper: Provider,
      }
    )
    await openInfoPanel(user)

    screen.getAllByRole('button', { name: 'eventManagement.invitation.send' }).forEach((button) => {
      expect(button).toBeDisabled()
    })
    expect(screen.getAllByText('eventManagement.invitation.sent')).toHaveLength(2)
    expect(screen.getAllByText('eventManagement.invitation.sent')[0].closest('tr')).toContainElement(
      screen.getAllByRole('button', { name: 'eventManagement.invitation.send' })[0]
    )
  })

  it('does not allow sending invitations again in picked state when invitations were already sent', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{ ...eventWithParticipantsInvited, invitationAttachments: { ALO: 'alo-key' }, state: 'picked' }}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          invitationAttachmentSent: registration.class === 'ALO' ? 'alo-key' : undefined,
          messagesSent: { invitation: true },
        }))}
      />,
      {
        wrapper: Provider,
      }
    )
    await openInfoPanel(user)

    screen.getAllByRole('button', { name: 'eventManagement.invitation.send' }).forEach((button) => {
      expect(button).toBeDisabled()
    })
    expect(screen.getAllByText('eventManagement.invitation.sent')).toHaveLength(2)
  })
})
