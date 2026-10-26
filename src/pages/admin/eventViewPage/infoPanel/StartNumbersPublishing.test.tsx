import type { ConfirmedEvent, Registration } from '@/types'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const renderRow = (event: ConfirmedEvent, onSetStartNumbersPublished = vi.fn()) =>
  render(
    <StartNumbersPublishing
      event={event}
      eventWithCurrentAttachments={event}
      numbersByClass={{
        'NOME-A': { cancelled: 0, invalid: false, participants: 2, places: 2, reserve: 0, value: 2 },
      }}
      onSetStartNumbersPublished={onSetStartNumbersPublished}
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

  it('names only the start list while the list is unpublished, though an invitation is outstanding', () => {
    renderRow({ ...nomeA('2026-10-26'), startListPublished: false })

    expect(screen.getByText('eventManagement.results.startListRequired')).toBeInTheDocument()
    expect(screen.queryByText('eventManagement.startList.invitationsRequired')).not.toBeInTheDocument()
  })

  it('lets the numbers out on the trial day, the invitation still unsent (KOE-1638)', () => {
    renderRow(nomeA('2026-10-25'))

    expect(screen.getByRole('button', { name: 'eventManagement.startList.publishNumbers' })).toBeEnabled()
    expect(screen.queryByText('eventManagement.startList.invitationsRequired')).not.toBeInTheDocument()
  })

  it('hides published numbers the day before, an invitation still unsent (KOE-1646)', async () => {
    const onSetStartNumbersPublished = vi.fn().mockResolvedValue(undefined)
    renderRow({ ...nomeA('2026-10-26'), startNumbersPublished: true }, onSetStartNumbersPublished)

    const hide = screen.getByRole('button', { name: 'eventManagement.startList.hideNumbers' })
    expect(hide).toBeEnabled()

    await userEvent.click(hide)

    await waitFor(() => expect(onSetStartNumbersPublished).toHaveBeenCalledWith(undefined, false, undefined, undefined))
  })

  it('hides a published day of a two-day trial, and keeps the other day waiting on its invitation (KOE-1646)', async () => {
    const onSetStartNumbersPublished = vi.fn().mockResolvedValue(undefined)
    renderRow(
      { ...nomeA('2026-10-26'), endDate: '2026-10-27', startNumbersPublished: ['2026-10-26'] },
      onSetStartNumbersPublished
    )

    const hideFirstDay = screen.getByRole('button', { name: 'eventManagement.startList.hideNumbersDay day' })
    expect(hideFirstDay).toBeEnabled()
    expect(screen.getByRole('button', { name: 'eventManagement.startList.publishNumbersDay day' })).toBeDisabled()

    await userEvent.click(hideFirstDay)

    await waitFor(() =>
      expect(onSetStartNumbersPublished).toHaveBeenCalledWith(undefined, false, '2026-10-26', undefined)
    )
  })
})
