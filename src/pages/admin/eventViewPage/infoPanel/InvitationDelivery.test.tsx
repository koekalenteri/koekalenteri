import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { Registration } from '../../../../types'
import { screen, waitFor } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'
import { RecoilRoot } from 'recoil'
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
import * as eventApi from '../../../../api/event'
import { APIError } from '../../../../api/http'
import { eventRegistrationDateKey } from '../../../../lib/event'
import { renderWithUserEvents, TEST_ID_TOKEN } from '../../../../test-utils/utils'
import { adminEventsAtom } from '../../recoil'
import InfoPanel from '../InfoPanel'

const activeEventWithStaticDates = {
  ...eventWithStaticDates,
  endDate: new Date('2099-12-31'),
}
const activeEventWithStaticDatesAndClass = {
  ...eventWithStaticDatesAndClass,
  endDate: new Date('2099-12-31'),
}

// Mock the API calls
jest.mock('../../../../api/event')
jest.mock('../../../../api/user')
jest.mock('../../recoil/events/effects', () => ({
  adminRemoteEventsEffect: () => undefined,
}))

// Mock the notistack enqueueSnackbar
jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
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
    jest.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })

  afterAll(() => localStorage.removeItem('idToken'))

  it('shows invitation attachments before the send action', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })
    await openInfoPanel(user)

    const attachmentButton = screen.getByRole('button', { name: 'eventManagement.attachment.addPdf' })
    const sendButton = screen.getByRole('button', { name: 'eventManagement.invitation.send' })

    expect(attachmentButton.compareDocumentPosition(sendButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
})
