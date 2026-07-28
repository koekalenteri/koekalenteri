import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { Registration } from '../../../types'
import { screen, waitFor } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'
import { RecoilRoot } from 'recoil'
import {
  eventWithEntryClosed,
  eventWithEntryOpen,
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAndClass,
} from '../../../__mockData__/events'
import {
  registrationsToEventWithEntryClosed,
  registrationsToEventWithParticipantsInvited,
  registrationWithStaticDates,
} from '../../../__mockData__/registrations'
import * as eventApi from '../../../api/event'
import { APIError } from '../../../api/http'
import { eventRegistrationDateKey } from '../../../lib/event'
import { renderWithUserEvents, TEST_ID_TOKEN } from '../../../test-utils/utils'
import { idTokenAtom } from '../../recoil'
import { adminEventsAtom } from '../recoil'
import InfoPanel from './InfoPanel'

const activeEventWithStaticDates = {
  ...eventWithStaticDates,
  endDate: new Date('2099-12-31'),
}
const activeEventWithStaticDatesAndClass = {
  ...eventWithStaticDatesAndClass,
  endDate: new Date('2099-12-31'),
}

// Mock the API calls
jest.mock('../../../api/event')
jest.mock('../../../api/user')
jest.mock('../recoil/events/effects', () => ({
  adminRemoteEventsEffect: () => undefined,
}))

// Mock the notistack enqueueSnackbar
jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

function getGroupKey(r: Registration, i: number) {
  if (r.cancelled) return 'cancelled'
  if (i === 0) return 'reserve'
  return eventRegistrationDateKey(r.dates[0])
}

async function openInfoPanel(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'eventManagement.open' }))
}

describe('InfoPanel>', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })

  afterAll(() => localStorage.removeItem('idToken'))

  it('renders with no registrations', () => {
    const { container } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: ({ children }) => (
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>{children}</RecoilRoot>
      ),
    })

    const openButton = screen.getByRole('button', { name: 'eventManagement.open' })
    expect(openButton).toHaveStyle({ flexDirection: 'row' })
    expect(screen.getByTestId('MenuOpenIcon')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('renders with event with closed entry and registrations', () => {
    const { container } = renderWithUserEvents(
      <InfoPanel event={eventWithEntryClosed} registrations={registrationsToEventWithEntryClosed} />,
      { wrapper: RecoilRoot }
    )

    expect(container).toMatchSnapshot()
  })

  it('renders with event with closed entry and registrations with groups', () => {
    const { container } = renderWithUserEvents(
      <InfoPanel
        event={eventWithEntryClosed}
        registrations={registrationsToEventWithEntryClosed.map((r, i) => ({
          ...r,
          group: {
            ...r.dates[0],
            key: getGroupKey(r, i),
            number: i,
          },
        }))}
      />,
      { wrapper: RecoilRoot }
    )

    expect(container).toMatchSnapshot()
  })

  it('shows status and task sections when opened', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={activeEventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    expect(screen.getByRole('tab', { name: 'eventManagement.tabs.management' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('eventManagement.actions')).toBeInTheDocument()
    expect(screen.getByText('eventManagement.participantSelection.title')).toBeInTheDocument()
    expect(screen.getByText('eventManagement.invitation.delivery')).toBeInTheDocument()
    expect(screen.getByText('eventManagement.startList.publishing')).toBeInTheDocument()
    expect(screen.getByText('eventManagement.participantSelection.reserve')).toBeInTheDocument()
    const reserveRow = screen.getByText('eventManagement.participantSelection.reserve').closest('tr')
    if (!reserveRow) throw new Error('reserve row not found')
    const participantRow = reserveRow.previousElementSibling
    if (!(participantRow instanceof HTMLTableRowElement)) throw new Error('participant row not found')
    expect(participantRow).toHaveTextContent('NOU')
    expect((reserveRow.lastElementChild as HTMLTableCellElement).cellIndex).toBe(
      (participantRow.lastElementChild as HTMLTableCellElement).cellIndex
    )
    expect(screen.queryByText('Valmistelu')).not.toBeInTheDocument()
    expect(screen.queryByText('Kokeen tiedot')).not.toBeInTheDocument()
    expect(screen.queryByText('Koko koe')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.attachment.addPdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.attachment.addPdf' }).closest('td')).toHaveClass(
      'MuiTableCell-alignRight'
    )
    expect(screen.getByText('eventManagement.invitation.canSendAfterPicked')).toBeInTheDocument()
    expect(screen.getByTestId('info-panel-content')).toHaveStyle({
      gridAutoRows: 'max-content',
      overflowY: 'auto',
    })
  })

  it('shows the audit trail on its own tab', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={activeEventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    await user.click(screen.getByRole('tab', { name: 'eventManagement.tabs.auditTrail' }))

    expect(screen.getByRole('tab', { name: 'eventManagement.tabs.auditTrail' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('eventManagement.participantSelection.title')).not.toBeVisible()
  })

  it('shows invitation attachments before the send action', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    const attachmentButton = screen.getByRole('button', { name: 'eventManagement.attachment.addPdf' })
    const sendButton = screen.getByRole('button', { name: 'eventManagement.invitation.send' })

    expect(attachmentButton.compareDocumentPosition(sendButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('runs the moved create registration action', async () => {
    const onCreateRegistration = jest.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel event={activeEventWithStaticDates} onCreateRegistration={onCreateRegistration} registrations={[]} />,
      {
        wrapper: RecoilRoot,
      }
    )
    await openInfoPanel(user)

    await user.click(screen.getByRole('button', { name: /createRegistration/i }))

    expect(onCreateRegistration).toHaveBeenCalledTimes(1)
  })

  it('runs the moved event details action', async () => {
    const onOpenDetails = jest.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel event={eventWithStaticDates} onOpenDetails={onOpenDetails} registrations={[]} />,
      {
        wrapper: RecoilRoot,
      }
    )
    await openInfoPanel(user)

    await user.click(screen.getByRole('button', { name: 'eventManagement.showEventDetails' }))

    expect(onOpenDetails).toHaveBeenCalledTimes(1)
  })

  it('links to the authenticated public start list preview', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    const publicStartListLink = screen.getByRole('link', { name: 'eventManagement.startList.preview' })
    expect(publicStartListLink).toHaveAttribute('href', `/admin/event/startlist-preview/${eventWithStaticDates.id}`)
    expect(
      screen.getByText('eventManagement.startList.publishing').compareDocumentPosition(publicStartListLink) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('expands and collapses correctly', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })

    // Initially, only the drawer handle should be visible
    expect(screen.getByRole('button', { name: 'eventManagement.open' })).toBeInTheDocument()
    expect(screen.queryByText('eventManagement.participantSelection.title')).not.toBeInTheDocument()

    await openInfoPanel(user)

    // The opened drawer should show the panel contents
    expect(screen.getByText('eventManagement.participantSelection.title')).toBeInTheDocument()

    const collapseButton = screen.getByRole('button', { name: 'eventManagement.close' })
    await user.click(collapseButton)

    // The drawer should collapse back to the handle
    expect(screen.queryByText('eventManagement.participantSelection.title')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.open' })).toBeInTheDocument()
  })

  it('collapses when clicking outside the drawer', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
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
        wrapper: RecoilRoot,
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
        wrapper: RecoilRoot,
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
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    expect(screen.getByText('eventManagement.participantSelection.canSendAfterEntry')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'eventManagement.participantSelection.sendPlaceNotification' })
    ).not.toBeInTheDocument()
  })

  it('does not show entry period guidance after the event has ended', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{ ...eventWithParticipantsInvited, endDate: new Date(0) }}
        registrations={registrationsToEventWithParticipantsInvited}
      />,
      { wrapper: RecoilRoot }
    )
    await openInfoPanel(user)

    expect(screen.queryByText('eventManagement.participantSelection.canSendAfterEntry')).not.toBeInTheDocument()
    expect(screen.queryByText('eventManagement.invitation.canSendAfterEntry')).not.toBeInTheDocument()
    screen
      .getAllByRole('button', { name: /eventManagement\.(invitation\.send|participantSelection\.send)/ })
      .forEach((button) => {
        expect(button).toBeDisabled()
      })
    screen.getAllByRole('button', { name: 'eventManagement.attachment.addPdf' }).forEach((button) => {
      expect(button).toHaveAttribute('aria-disabled', 'true')
    })
    screen.getAllByRole('button', { name: 'eventManagement.startList.hide' }).forEach((button) => {
      expect(button).toBeDisabled()
    })
    expect(screen.getByRole('button', { name: 'createRegistration' })).toBeDisabled()
  })

  it('disables invitations before the registration period is over', async () => {
    const event = {
      ...eventWithEntryOpen,
      classes: [{ class: 'VOI' as const, date: eventWithEntryOpen.startDate, places: 3 }],
      state: 'picked' as const,
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
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    expect(screen.getByRole('button', { name: 'eventManagement.invitation.send' })).toBeDisabled()
    expect(screen.getByText('eventManagement.invitation.canSendAfterEntry')).toBeInTheDocument()
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
        wrapper: RecoilRoot,
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
        wrapper: RecoilRoot,
      }
    )
    await openInfoPanel(user)

    screen.getAllByRole('button', { name: 'eventManagement.invitation.send' }).forEach((button) => {
      expect(button).toBeDisabled()
    })
    expect(screen.getAllByText('eventManagement.invitation.sent')).toHaveLength(2)
  })

  it('shows status when reserve notifications have been sent', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={eventWithEntryClosed}
        registrations={registrationsToEventWithEntryClosed.map((registration, index) => ({
          ...registration,
          group: { ...registration.dates[0], key: 'reserve', number: index + 1 },
          reserveNotified: index + 1,
        }))}
      />,
      { wrapper: RecoilRoot }
    )
    await openInfoPanel(user)

    expect(screen.getAllByText('eventManagement.participantSelection.reserveNotificationsSent')).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: 'eventManagement.participantSelection.sendReserveNotification' })
    ).not.toBeInTheDocument()
  })

  it('keeps place notification status visible when invitations can be sent', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{ ...eventWithParticipantsInvited, state: 'picked' }}
        registrations={registrationsToEventWithParticipantsInvited}
      />,
      { wrapper: RecoilRoot }
    )
    await openInfoPanel(user)

    expect(screen.getAllByText('eventManagement.participantSelection.placeNotificationsSent')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'eventManagement.invitation.send' })).toHaveLength(2)
  })

  it('allows resending class invitations when class attachment is added after common attachment was sent', async () => {
    const onOpenMessageDialog = jest.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{
          ...eventWithParticipantsInvited,
          classes: eventWithParticipantsInvited.classes.map((eventClass) =>
            eventClass.class === 'AVO' ? { ...eventClass, places: 3 } : eventClass
          ),
          invitationAttachment: 'common-key',
          invitationAttachments: { ALO: 'alo-key' },
        }}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          invitationAttachmentSent: 'common-key',
          messagesSent: { invitation: true },
        }))}
        onOpenMessageDialog={onOpenMessageDialog}
      />,
      {
        wrapper: RecoilRoot,
      }
    )
    await openInfoPanel(user)

    const resendButton = screen
      .getAllByRole('button', { name: 'eventManagement.invitation.send' })
      .find((button) => !button.hasAttribute('disabled'))

    if (!resendButton) throw new Error('enabled resend button not found')
    expect(resendButton).toBeEnabled()
    expect(screen.getAllByText('eventManagement.invitation.sent')).toHaveLength(1)

    await user.click(resendButton)
    expect(onOpenMessageDialog).toHaveBeenCalledWith(
      [
        expect.objectContaining({ class: 'ALO', id: expect.stringMatching(/1$/) }),
        expect.objectContaining({ class: 'ALO', id: expect.stringMatching(/2$/) }),
      ],
      'invitation'
    )
  })

  it('allows resending invitations when attachment has changed', async () => {
    const onOpenMessageDialog = jest.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{ ...eventWithParticipantsInvited, invitationAttachments: { ALO: 'new-alo-key' } }}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          invitationAttachmentSent:
            registration.class === 'ALO' && registration.id.endsWith('1') ? 'old-alo-key' : 'new-alo-key',
          messagesSent: { invitation: true },
        }))}
        onOpenMessageDialog={onOpenMessageDialog}
      />,
      {
        wrapper: RecoilRoot,
      }
    )
    await openInfoPanel(user)

    const resendButton = screen
      .getAllByRole('button', { name: 'eventManagement.invitation.send' })
      .find((button) => !button.hasAttribute('disabled'))

    if (!resendButton) throw new Error('enabled resend button not found')
    expect(resendButton).toBeEnabled()
    await user.click(resendButton)
    expect(onOpenMessageDialog).toHaveBeenCalledWith(
      [expect.objectContaining({ id: expect.stringMatching(/1$/) })],
      'invitation'
    )
  })

  it('does not couple start list publishing to sending invitations', async () => {
    const onOpenMessageDialog = jest.fn()
    const onSetStartListPublished = jest.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{
          ...eventWithParticipantsInvited,
          invitationAttachments: { ALO: 'new-alo-key' },
          startListPublished: { ALO: false },
        }}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          invitationAttachmentSent:
            registration.class === 'ALO' && registration.id.endsWith('1') ? 'old-alo-key' : 'new-alo-key',
          messagesSent: { invitation: true },
        }))}
        onOpenMessageDialog={onOpenMessageDialog}
        onSetStartListPublished={onSetStartListPublished}
      />,
      {
        wrapper: RecoilRoot,
      }
    )
    await openInfoPanel(user)

    expect(screen.queryByLabelText('Julkaise starttilista samalla')).not.toBeInTheDocument()

    const resendButton = screen
      .getAllByRole('button', { name: 'eventManagement.invitation.send' })
      .find((button) => !button.hasAttribute('disabled'))

    if (!resendButton) throw new Error('enabled resend button not found')
    await user.click(resendButton)

    expect(onOpenMessageDialog).toHaveBeenCalledWith(
      [expect.objectContaining({ id: expect.stringMatching(/1$/) })],
      'invitation'
    )
    expect(onSetStartListPublished).not.toHaveBeenCalled()
  })

  it('does not offer publishing while sending when the event-level start list is already published', async () => {
    const onOpenMessageDialog = jest.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{
          ...eventWithParticipantsInvited,
          invitationAttachments: { ALO: 'new-alo-key' },
          startListPublished: true,
        }}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          invitationAttachmentSent:
            registration.class === 'ALO' && registration.id.endsWith('1') ? 'old-alo-key' : 'new-alo-key',
          messagesSent: { invitation: true },
        }))}
        onOpenMessageDialog={onOpenMessageDialog}
      />,
      {
        wrapper: RecoilRoot,
      }
    )
    await openInfoPanel(user)

    expect(screen.queryByLabelText('Julkaise starttilista samalla')).not.toBeInTheDocument()

    const resendButton = screen
      .getAllByRole('button', { name: 'eventManagement.invitation.send' })
      .find((button) => !button.hasAttribute('disabled'))

    if (!resendButton) throw new Error('enabled resend button not found')
    await user.click(resendButton)

    expect(onOpenMessageDialog).toHaveBeenCalledWith(
      [expect.objectContaining({ id: expect.stringMatching(/1$/) })],
      'invitation'
    )
  })

  it('shows a publish start list CTA when invitations are sent but the class start list is not published', async () => {
    const onSetStartListPublished = jest.fn().mockResolvedValue(undefined)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(adminEventsAtom, [eventWithParticipantsInvited])}>
        {children}
      </RecoilRoot>
    )
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{
          ...eventWithParticipantsInvited,
          classes: eventWithParticipantsInvited.classes.map((eventClass) =>
            eventClass.class === 'AVO' ? { ...eventClass, places: 3 } : eventClass
          ),
          invitationAttachments: { ALO: 'alo-key' },
          startListPublished: { ALO: false, AVO: true },
        }}
        onSetStartListPublished={onSetStartListPublished}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          invitationAttachmentSent: registration.class === 'ALO' ? 'alo-key' : undefined,
          messagesSent: { invitation: true },
        }))}
      />,
      { wrapper }
    )
    await openInfoPanel(user)

    expect(screen.getAllByText('eventManagement.invitation.sent')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'eventManagement.startList.publish' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'eventManagement.startList.publish' })).toHaveClass(
      'MuiButton-colorPrimary'
    )

    await user.click(screen.getByRole('button', { name: 'eventManagement.startList.publish' }))

    await waitFor(() => {
      expect(onSetStartListPublished).toHaveBeenCalledWith('ALO', true)
    })
  })

  it('allows publishing an invited class start list even when the event is only confirmed', async () => {
    const onSetStartListPublished = jest.fn().mockResolvedValue(undefined)
    const event = {
      ...eventWithParticipantsInvited,
      classes: eventWithParticipantsInvited.classes.map((eventClass) => ({
        ...eventClass,
        state: eventClass.class === 'ALO' ? ('invited' as const) : ('picked' as const),
      })),
      invitationAttachments: { ALO: 'alo-key' },
      startListPublished: { ALO: false, AVO: true },
      state: 'confirmed' as const,
    }
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(adminEventsAtom, [event])}>{children}</RecoilRoot>
    )
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={event}
        onSetStartListPublished={onSetStartListPublished}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          invitationAttachmentSent: registration.class === 'ALO' ? 'alo-key' : undefined,
          messagesSent: { invitation: true },
        }))}
      />,
      { wrapper }
    )
    await openInfoPanel(user)

    expect(screen.getByRole('button', { name: 'eventManagement.startList.publish' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'eventManagement.startList.publish' }))

    await waitFor(() => {
      expect(onSetStartListPublished).toHaveBeenCalledWith('ALO', true)
    })
  })

  it('shows an unpublish start list CTA when invitations are sent and the class start list is published', async () => {
    const onSetStartListPublished = jest.fn().mockResolvedValue(undefined)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(adminEventsAtom, [eventWithParticipantsInvited])}>
        {children}
      </RecoilRoot>
    )
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{
          ...eventWithParticipantsInvited,
          classes: eventWithParticipantsInvited.classes.map((eventClass) =>
            eventClass.class === 'AVO' ? { ...eventClass, places: 3 } : eventClass
          ),
          invitationAttachments: { ALO: 'alo-key' },
          startListPublished: true,
        }}
        onSetStartListPublished={onSetStartListPublished}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          invitationAttachmentSent: registration.class === 'ALO' ? 'alo-key' : undefined,
          messagesSent: { invitation: true },
        }))}
      />,
      { wrapper }
    )
    await openInfoPanel(user)

    expect(screen.getAllByText('eventManagement.invitation.sent')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'eventManagement.startList.hide' })[0]).toBeEnabled()
    expect(screen.getAllByRole('button', { name: 'eventManagement.startList.hide' })[0]).toHaveClass(
      'MuiButton-colorSecondary'
    )

    await user.click(screen.getAllByRole('button', { name: 'eventManagement.startList.hide' })[0])

    await waitFor(() => {
      expect(onSetStartListPublished).toHaveBeenCalledWith('ALO', false)
    })
  })

  it('shows a publish start list CTA for an event without classes', async () => {
    const onSetStartListPublished = jest.fn().mockResolvedValue(undefined)
    const event = {
      ...activeEventWithStaticDates,
      startListPublished: false,
      state: 'invited' as const,
    }
    const registrations = [
      {
        ...registrationWithStaticDates,
        group: { date: event.startDate, key: 'NOU', number: 1 },
        messagesSent: { invitation: true },
      },
    ]
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(adminEventsAtom, [event])}>{children}</RecoilRoot>
    )
    const { user } = renderWithUserEvents(
      <InfoPanel event={event} onSetStartListPublished={onSetStartListPublished} registrations={registrations} />,
      { wrapper }
    )
    await openInfoPanel(user)

    expect(screen.getByText('eventManagement.invitation.sent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.startList.publish' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'eventManagement.startList.publish' }))

    await waitFor(() => {
      expect(onSetStartListPublished).toHaveBeenCalledWith(undefined, true)
    })
  })

  it('shows a hide start list CTA for a published event without classes', async () => {
    const onSetStartListPublished = jest.fn().mockResolvedValue(undefined)
    const event = {
      ...activeEventWithStaticDates,
      startListPublished: true,
      state: 'invited' as const,
    }
    const registrations = [
      {
        ...registrationWithStaticDates,
        group: { date: event.startDate, key: 'NOU', number: 1 },
        messagesSent: { invitation: true },
      },
    ]
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(adminEventsAtom, [event])}>{children}</RecoilRoot>
    )
    const { user } = renderWithUserEvents(
      <InfoPanel event={event} onSetStartListPublished={onSetStartListPublished} registrations={registrations} />,
      { wrapper }
    )
    await openInfoPanel(user)

    expect(screen.getByText('eventManagement.invitation.sent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.startList.hide' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'eventManagement.startList.hide' }))

    await waitFor(() => {
      expect(onSetStartListPublished).toHaveBeenCalledWith(undefined, false)
    })
  })

  it('renders with event that has an invitation attachment', async () => {
    // Create a test event with an invitation attachment
    const eventWithAttachment = {
      ...eventWithStaticDates,
      invitationAttachment: 'test-attachment-key',
      invitationAttachmentHistory: {
        'test-attachment-key': { uploadedAt: new Date('2026-07-28T10:00:00.000Z') },
      },
    }

    const { user } = renderWithUserEvents(<InfoPanel event={eventWithAttachment} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    // It should show a link to the attachment
    expect(screen.getByText('koekutsu-20210210-NOU.pdf')).toBeInTheDocument()
    expect(screen.queryByText('eventManagement.attachment.noFile')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.attachment.replacePdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.attachment.replacePdf' })).toHaveClass(
      'MuiButton-colorSecondary'
    )
    expect(screen.getByText('eventManagement.attachment.updated date')).toBeInTheDocument()
    expect(screen.getByText('koekutsu-20210210-NOU.pdf').closest('td')).not.toBe(
      screen.getByRole('button', { name: 'eventManagement.attachment.replacePdf' }).closest('td')
    )
  })

  it('shows previously sent invitation attachments still referenced by participants', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{
          ...eventWithParticipantsInvited,
          invitationAttachmentHistory: {
            'new-alo-key': { className: 'ALO', uploadedAt: new Date('2026-07-28T10:00:00.000Z') },
            'old-alo-key': { className: 'ALO', uploadedAt: new Date('2026-07-27T09:00:00.000Z') },
          },
          invitationAttachments: { ALO: 'new-alo-key' },
        }}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          ...(registration.class === 'ALO'
            ? { invitationAttachmentSent: 'old-alo-key', messagesSent: { invitation: true } }
            : {}),
        }))}
      />,
      { wrapper: RecoilRoot }
    )
    await openInfoPanel(user)

    expect(screen.getByText('eventManagement.attachment.previouslySentPdfs')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'eventManagement.attachment.date date' })).toHaveAttribute(
      'href',
      expect.stringContaining('/file/old-alo-key/')
    )
  })

  it('shows a legacy common attachment for the class', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{ ...eventWithStaticDatesAndClass, invitationAttachment: 'common-attachment-key' }}
        registrations={[]}
      />,
      { wrapper: RecoilRoot }
    )
    await openInfoPanel(user)

    expect(screen.getByRole('button', { name: 'eventManagement.attachment.replacePdf' })).toHaveClass(
      'MuiButton-colorSecondary'
    )
    expect(screen.queryByRole('button', { name: 'eventManagement.attachment.addPdf' })).not.toBeInTheDocument()
    expect(screen.getByText('koekutsu-20210210-NOME-B-ALO.pdf')).toBeInTheDocument()
  })

  it('shows a legacy common attachment in every class', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{ ...eventWithParticipantsInvited, invitationAttachment: 'common-attachment-key' }}
        registrations={registrationsToEventWithParticipantsInvited}
      />,
      { wrapper: RecoilRoot }
    )
    await openInfoPanel(user)

    expect(screen.getAllByRole('button', { name: 'eventManagement.attachment.replacePdf' })).toHaveLength(2)
    expect(screen.queryByText('Koko koe')).not.toBeInTheDocument()
  })

  it('shows a clear error message when koekutsu upload returns 413', async () => {
    jest
      .spyOn(eventApi, 'putInvitationAttachment')
      .mockRejectedValueOnce(
        new APIError(new Response(null, { status: 413, statusText: 'Content Too Large' }), 'Content Too Large')
      )

    const { user } = renderWithUserEvents(<InfoPanel event={activeEventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    const input = document.querySelector('#koekutsu-file') as HTMLInputElement
    const file = new File(['pdf'], 'kutsu.pdf', { type: 'application/pdf' })

    await user.upload(input, file)

    await waitFor(() => {
      expect(enqueueSnackbar).toHaveBeenCalledWith('eventManagement.upload.attachmentTooLarge', {
        persist: true,
        variant: 'error',
      })
    })
  })

  it('allows retrying koekutsu upload with the same file after a failed attempt', async () => {
    const putInvitationAttachment = jest
      .spyOn(eventApi, 'putInvitationAttachment')
      .mockRejectedValueOnce(new Error('upload failed'))
      .mockResolvedValueOnce({
        invitationAttachmentHistory: {},
        key: 'retry-success-key',
        uploadedAt: new Date('2026-07-28T12:00:00.000Z'),
      })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(adminEventsAtom, [activeEventWithStaticDates])}>
        {children}
      </RecoilRoot>
    )

    const { user } = renderWithUserEvents(<InfoPanel event={activeEventWithStaticDates} registrations={[]} />, {
      wrapper,
    })
    await openInfoPanel(user)

    const input = document.querySelector('#koekutsu-file') as HTMLInputElement
    const file = new File(['pdf'], 'kutsu.pdf', { type: 'application/pdf' })

    await user.upload(input, file)

    await waitFor(() => {
      expect(enqueueSnackbar).toHaveBeenCalledWith('eventManagement.upload.attachmentFailed', {
        persist: true,
        variant: 'error',
      })
    })

    await user.upload(input, file)

    await waitFor(() => {
      expect(putInvitationAttachment).toHaveBeenCalledTimes(2)
    })

    expect(enqueueSnackbar).toHaveBeenCalledWith('eventManagement.upload.attached fileName', {
      variant: 'success',
    })
  })

  it('uploads class-specific invitation attachment', async () => {
    const putInvitationAttachment = jest.spyOn(eventApi, 'putInvitationAttachment').mockResolvedValueOnce({
      invitationAttachmentHistory: {},
      key: 'alo-key',
      uploadedAt: new Date('2026-07-28T12:00:00.000Z'),
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(adminEventsAtom, [activeEventWithStaticDatesAndClass])}>
        {children}
      </RecoilRoot>
    )
    const { user } = renderWithUserEvents(<InfoPanel event={activeEventWithStaticDatesAndClass} registrations={[]} />, {
      wrapper,
    })
    await openInfoPanel(user)

    expect(screen.getByText('eventManagement.invitation.class className')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'eventManagement.attachment.addPdf' })).toHaveLength(1)
    screen.getAllByRole('button', { name: 'eventManagement.attachment.addPdf' }).forEach((button) => {
      expect(button).toBeEnabled()
      expect(button).toHaveClass('MuiButton-colorSecondary')
      expect(button).toHaveClass('MuiButton-contained')
    })
    const classAttachmentButton = document.querySelector('label[for="koekutsu-file-ALO"] [role="button"]')
    const attachmentCell = classAttachmentButton?.closest('td') as HTMLTableCellElement
    const sendCell = screen
      .getByRole('button', { name: 'eventManagement.invitation.send' })
      .closest('td') as HTMLTableCellElement
    expect(attachmentCell).not.toBe(sendCell)
    expect(attachmentCell.cellIndex).toBe(sendCell.cellIndex)
    expect(classAttachmentButton?.closest('tr')).toHaveTextContent('eventManagement.attachment.noFile')

    const input = document.querySelector('#koekutsu-file-ALO') as HTMLInputElement
    const file = new File(['pdf'], 'alo-kutsu.pdf', { type: 'application/pdf' })

    await user.upload(input, file)

    expect(putInvitationAttachment).toHaveBeenCalledWith(
      eventWithStaticDatesAndClass.id,
      file,
      'ALO',
      expect.any(String)
    )
    expect(enqueueSnackbar).toHaveBeenCalledWith('eventManagement.upload.classAttached eventClass, fileName', {
      variant: 'success',
    })
  })
})
