import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { Registration } from '../../../types'
import { screen, waitFor } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'
import { RecoilRoot } from 'recoil'
import {
  eventWithEntryClosed,
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAndClass,
} from '../../../__mockData__/events'
import {
  registrationsToEventWithEntryClosed,
  registrationsToEventWithParticipantsInvited,
} from '../../../__mockData__/registrations'
import * as eventApi from '../../../api/event'
import { APIError } from '../../../api/http'
import { eventRegistrationDateKey } from '../../../lib/event'
import { renderWithUserEvents } from '../../../test-utils/utils'
import { adminEventsAtom } from '../recoil'
import InfoPanel from './InfoPanel'

// Mock the API calls
jest.mock('../../../api/event')

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
  await user.click(screen.getByRole('button', { name: 'Avaa tilannepaneeli' }))
}

describe('InfoPanel>', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders with no registrations', () => {
    const { container } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })

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
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    expect(screen.getByText('Tapahtuman hallinta')).toBeInTheDocument()
    expect(screen.getByText('Toiminnot')).toBeInTheDocument()
    expect(screen.getByText('Osallistujat')).toBeInTheDocument()
    expect(screen.getByText('Valmistelu')).toBeInTheDocument()
    expect(screen.getByText('Kokeen tiedot')).toBeInTheDocument()
    expect(screen.getByText('Koekutsu')).toBeInTheDocument()
  })

  it('runs the moved create registration action', async () => {
    const onCreateRegistration = jest.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel event={eventWithStaticDates} onCreateRegistration={onCreateRegistration} registrations={[]} />,
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

    await user.click(screen.getByRole('button', { name: /Näytä tapahtuman tiedot/i }))

    expect(onOpenDetails).toHaveBeenCalledTimes(1)
  })

  it('expands and collapses correctly', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })

    // Initially, only the drawer handle should be visible
    expect(screen.getByRole('button', { name: 'Avaa tilannepaneeli' })).toBeInTheDocument()
    expect(screen.queryByText('Osallistujat')).not.toBeInTheDocument()

    await openInfoPanel(user)

    // The opened drawer should show the panel contents
    expect(screen.getByText('Osallistujat')).toBeInTheDocument()

    const collapseButton = screen.getByRole('button', { name: 'Sulje tilannepaneeli' })
    await user.click(collapseButton)

    // The drawer should collapse back to the handle
    expect(screen.queryByText('Osallistujat')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avaa tilannepaneeli' })).toBeInTheDocument()
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
    const buttons = screen.getAllByRole('button').filter((button) => button.textContent?.includes('Lähetä'))

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
    const participantButtons = screen.getAllByText(/Lähetä.*koekutsu|Lähetä.*koepaikkailmoitus/i)

    participantButtons.forEach((button) => {
      expect(button).toBeDisabled()
    })
  })

  it('does not allow resending invitations when attachment has not changed', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={{ ...eventWithParticipantsInvited, invitationAttachments: { ALO: 'alo-key' } }}
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

    const invitationButtons = screen.getAllByRole('button', { name: /Lähetä koekutsu/i })

    expect(invitationButtons.length).toBeGreaterThan(0)
    invitationButtons.forEach((button) => {
      expect(button).toBeDisabled()
    })
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
      .getAllByRole('button', { name: 'Lähetä koekutsu' })
      .find((button) => !button.hasAttribute('disabled'))

    if (!resendButton) throw new Error('enabled resend button not found')
    expect(resendButton).toBeEnabled()
    await user.click(resendButton)
    expect(onOpenMessageDialog).toHaveBeenCalledWith(
      [expect.objectContaining({ id: expect.stringMatching(/1$/) })],
      'invitation'
    )
  })

  it('renders with event that has an invitation attachment', async () => {
    // Create a test event with an invitation attachment
    const eventWithAttachment = {
      ...eventWithStaticDates,
      invitationAttachment: 'test-attachment-key',
    }

    const { user } = renderWithUserEvents(<InfoPanel event={eventWithAttachment} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    // It should show a link to the attachment
    expect(screen.getByText('Kutsu.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Ei liitettyä tiedostoa')).not.toBeInTheDocument()
  })

  it('shows a clear error message when koekutsu upload returns 413', async () => {
    jest
      .spyOn(eventApi, 'putInvitationAttachment')
      .mockRejectedValueOnce(
        new APIError(new Response(null, { status: 413, statusText: 'Content Too Large' }), 'Content Too Large')
      )

    const { container, user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    const input = container.querySelector('#koekutsu-file') as HTMLInputElement
    const file = new File(['pdf'], 'kutsu.pdf', { type: 'application/pdf' })

    await user.upload(input, file)

    await waitFor(() => {
      expect(enqueueSnackbar).toHaveBeenCalledWith(
        'Koekutsun tiedosto on liian suuri. Pienennä PDF-tiedoston kokoa ja yritä uudelleen.',
        { persist: true, variant: 'error' }
      )
    })
  })

  it('allows retrying koekutsu upload with the same file after a failed attempt', async () => {
    const putInvitationAttachment = jest
      .spyOn(eventApi, 'putInvitationAttachment')
      .mockRejectedValueOnce(new Error('upload failed'))
      .mockResolvedValueOnce('retry-success-key')

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(adminEventsAtom, [eventWithStaticDates])}>{children}</RecoilRoot>
    )

    const { container, user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper,
    })
    await openInfoPanel(user)

    const input = container.querySelector('#koekutsu-file') as HTMLInputElement
    const file = new File(['pdf'], 'kutsu.pdf', { type: 'application/pdf' })

    await user.upload(input, file)

    await waitFor(() => {
      expect(enqueueSnackbar).toHaveBeenCalledWith('Koekutsun liittäminen epäonnistui. Yritä uudelleen.', {
        persist: true,
        variant: 'error',
      })
    })

    await user.upload(input, file)

    await waitFor(() => {
      expect(putInvitationAttachment).toHaveBeenCalledTimes(2)
    })

    expect(enqueueSnackbar).toHaveBeenCalledWith('Koekutsu liitetty: koekutsu-20210210-NOU.pdf', {
      variant: 'success',
    })
  })

  it('uploads class-specific invitation attachment', async () => {
    const putInvitationAttachment = jest.spyOn(eventApi, 'putInvitationAttachment').mockResolvedValueOnce('alo-key')
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(adminEventsAtom, [eventWithStaticDatesAndClass])}>
        {children}
      </RecoilRoot>
    )
    const { container, user } = renderWithUserEvents(
      <InfoPanel event={eventWithStaticDatesAndClass} registrations={[]} />,
      {
        wrapper,
      }
    )
    await openInfoPanel(user)

    const input = container.querySelector('#koekutsu-file-ALO') as HTMLInputElement
    const file = new File(['pdf'], 'alo-kutsu.pdf', { type: 'application/pdf' })

    await user.upload(input, file)

    expect(putInvitationAttachment).toHaveBeenCalledWith(
      eventWithStaticDatesAndClass.id,
      file,
      'ALO',
      expect.any(String)
    )
    expect(enqueueSnackbar).toHaveBeenCalledWith('ALO koekutsu liitetty: koekutsu-20210210-NOME-B-ALO.pdf', {
      variant: 'success',
    })
  })
})
