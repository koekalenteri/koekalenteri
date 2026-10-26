import type { ConfirmedEvent, Registration } from '@/types'
import { render, screen } from '@testing-library/react'
import { eventWithParticipantsInvited } from '@/__mockData__/events'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { freezeClockAt } from '@/test-utils/freezeClock'
import StartNumbersPublishing from './StartNumbersPublishing'

vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

freezeClockAt('2026-10-25')

// A one-day NOME-A with its list out: one dog invited, one lifted from the reserve and not yet invited.
const nomeA = (day: '2026-10-25' | '2026-10-26'): ConfirmedEvent => ({
  ...eventWithParticipantsInvited,
  classes: [],
  endDate: day,
  eventType: 'NOME-A',
  startDate: day,
  startListPublished: true,
  startNumbersPublished: false,
  state: 'invited',
})
const dog = (id: string, invited: boolean): Registration => ({
  ...registrationWithStaticDates,
  class: undefined,
  eventType: 'NOME-A',
  id,
  messagesSent: invited ? { invitation: true } : {},
})
const selectedByClass = { 'NOME-A': [dog('r1', true), dog('r2', false)] }

const renderRow = (event: ConfirmedEvent) =>
  render(
    <StartNumbersPublishing
      event={event}
      eventWithCurrentAttachments={event}
      numbersByClass={{
        'NOME-A': { cancelled: 0, invalid: false, participants: 2, places: 2, reserve: 0, value: 2 },
      }}
      onSetStartNumbersPublished={vi.fn()}
      selectedByClass={selectedByClass}
    />
  )

describe('StartNumbersPublishing', () => {
  it('says why the numbers are dead the day before: an invitation is still to go (KOE-1638)', () => {
    renderRow(nomeA('2026-10-26'))

    expect(screen.getByRole('button', { name: 'eventManagement.startList.publishNumbers' })).toBeDisabled()
    expect(screen.getByText('eventManagement.startList.invitationsRequired')).toBeInTheDocument()
    expect(screen.queryByText('eventManagement.results.startListRequired')).not.toBeInTheDocument()
  })

  it('lets the numbers out on the trial day, the invitation still unsent (KOE-1638)', () => {
    renderRow(nomeA('2026-10-25'))

    expect(screen.getByRole('button', { name: 'eventManagement.startList.publishNumbers' })).toBeEnabled()
    expect(screen.queryByText('eventManagement.startList.invitationsRequired')).not.toBeInTheDocument()
  })
})
