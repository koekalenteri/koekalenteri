import type { Registration } from '../../../types'
import { screen, within } from '@testing-library/react'
import { eventWithParticipantsInvited } from '../../../__mockData__/events'
import { registrationsToEventWithParticipantsInvited } from '../../../__mockData__/registrations'
import { renderWithUserEvents } from '../../../test-utils/utils'
import MessageRecipientsDialog from './MessageRecipientsDialog'

// ALO: two participants, one cancelled and two reserves. AVO: two participants and no reserve.
const registrations = registrationsToEventWithParticipantsInvited

const renderDialog = (onContinue = vi.fn(), onCancel = vi.fn()) => ({
  onCancel,
  onContinue,
  ...renderWithUserEvents(
    <MessageRecipientsDialog
      event={eventWithParticipantsInvited}
      onCancel={onCancel}
      onContinue={onContinue}
      open
      registrations={registrations}
    />
  ),
})

const groupOf = (eventClass: string) => screen.getByRole('group', { name: eventClass })
const participantsBox = (eventClass: string) =>
  within(groupOf(eventClass)).getByRole('checkbox', { name: /participants/ })
const reserveBox = (eventClass: string) => within(groupOf(eventClass)).getByRole('checkbox', { name: /reserve/ })
const idsOf = (recipients: Registration[]) => recipients.map((registration) => registration.id).sort()

describe('MessageRecipientsDialog', () => {
  it('offers the participants and the reserves of every class', () => {
    renderDialog()

    // A message is usually for the participants, so they are picked to begin with.
    expect(participantsBox('ALO')).toBeChecked()
    expect(participantsBox('AVO')).toBeChecked()
    expect(reserveBox('ALO')).not.toBeChecked()
    // Nobody is on the reserve list of AVO, so there is nobody to send to.
    expect(reserveBox('AVO')).toBeDisabled()
  })

  it('sends to the participants of every class, leaving out the cancelled', async () => {
    const { onContinue, user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'eventManagement.message.continue' }))

    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(idsOf(onContinue.mock.calls[0][0])).toEqual(['testInvited1', 'testInvited2', 'testInvited3', 'testInvited4'])
  })

  it('adds a class reserve list to the recipients when picked', async () => {
    const { onContinue, user } = renderDialog()

    await user.click(reserveBox('ALO'))
    await user.click(participantsBox('AVO'))
    await user.click(screen.getByRole('button', { name: 'eventManagement.message.continue' }))

    expect(idsOf(onContinue.mock.calls[0][0])).toEqual(['testInvited1', 'testInvited2', 'testInvited6', 'testInvited7'])
  })

  it('has nothing to continue with when no group is picked', async () => {
    const { onContinue, user } = renderDialog()

    await user.click(participantsBox('ALO'))
    await user.click(participantsBox('AVO'))

    expect(screen.getByRole('button', { name: 'eventManagement.message.continue' })).toBeDisabled()
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('cancels without sending', async () => {
    const { onCancel, onContinue, user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onContinue).not.toHaveBeenCalled()
  })
})
