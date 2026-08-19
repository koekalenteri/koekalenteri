import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { Registration } from '../../../../types'
import { screen, waitFor } from '@testing-library/react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import {
  eventWithEntryOpen,
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAndClass,
} from '../../../../__mockData__/events'
import {
  registrationsToEventWithParticipantsInvited,
  registrationWithStaticDates,
} from '../../../../__mockData__/registrations'
import { eventRegistrationDateKey } from '../../../../lib/event'
import { renderWithUserEvents, TEST_ID_TOKEN } from '../../../../test-utils/utils'
import { adminEventsAtom } from '../../state'
import InfoPanel from '../InfoPanel'

const activeEventWithStaticDates = {
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

  it('does not show an untracked legacy start list as published while entry is open', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider initializeState={({ set }) => set(adminEventsAtom, [eventWithEntryOpen])}>{children}</Provider>
    )
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithEntryOpen} registrations={[]} />, { wrapper })
    await openInfoPanel(user)

    expect(screen.queryByText('eventManagement.startList.published')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'eventManagement.startList.previewUnpublished' })).toBeInTheDocument()
  })

  it('shows a publish start list CTA when invitations are sent but the class start list is not published', async () => {
    const onSetStartListPublished = vi.fn().mockResolvedValue(undefined)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider initializeState={({ set }) => set(adminEventsAtom, [eventWithParticipantsInvited])}>
        {children}
      </Provider>
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
    expect(screen.getByText('eventManagement.startList.published')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'eventManagement.startList.previewUnpublished' })).toBeInTheDocument()
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
    const onSetStartListPublished = vi.fn().mockResolvedValue(undefined)
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
      <Provider initializeState={({ set }) => set(adminEventsAtom, [event])}>{children}</Provider>
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

    const publishButton = screen
      .getAllByRole('button', { name: 'eventManagement.startList.publish' })
      .find((button) => !button.hasAttribute('disabled'))
    if (!publishButton) throw new Error('enabled publish button not found')
    expect(publishButton).toBeEnabled()

    await user.click(publishButton)

    await waitFor(() => {
      expect(onSetStartListPublished).toHaveBeenCalledWith('ALO', true)
    })
  })

  it('shows an unpublish start list CTA when invitations are sent and the class start list is published', async () => {
    const onSetStartListPublished = vi.fn().mockResolvedValue(undefined)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider initializeState={({ set }) => set(adminEventsAtom, [eventWithParticipantsInvited])}>
        {children}
      </Provider>
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
    const onSetStartListPublished = vi.fn().mockResolvedValue(undefined)
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
      <Provider initializeState={({ set }) => set(adminEventsAtom, [event])}>{children}</Provider>
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
    const onSetStartListPublished = vi.fn().mockResolvedValue(undefined)
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
      <Provider initializeState={({ set }) => set(adminEventsAtom, [event])}>{children}</Provider>
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

  it('shows a public start list CTA when every class start list is published', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider initializeState={({ set }) => set(adminEventsAtom, [eventWithParticipantsInvited])}>
        {children}
      </Provider>
    )
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{ ...eventWithParticipantsInvited, startListPublished: true }}
        registrations={registrationsToEventWithParticipantsInvited.map((registration) => ({
          ...registration,
          messagesSent: { invitation: true },
        }))}
      />,
      { wrapper }
    )
    await openInfoPanel(user)

    expect(screen.getByRole('link', { name: 'eventManagement.startList.preview' })).toBeInTheDocument()
  })
})
