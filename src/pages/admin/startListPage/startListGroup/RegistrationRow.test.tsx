import type { Registration } from '@/types'
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import RegistrationRow from './RegistrationRow'

// The real Finnish formats: a missing date is what the translator would print as its placeholder.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: i18n.getFixedT('fi') }) }))

const renderRow = (reg: Registration) =>
  render(
    <table>
      <tbody>
        <RegistrationRow reg={reg} reserve={false} nameLen={20} />
      </tbody>
    </table>
  )

describe('RegistrationRow', () => {
  it("shows the dog's birth day", () => {
    renderRow({ ...registrationWithStaticDates, dog: { ...registrationWithStaticDates.dog, dob: '2021-01-01' } })

    expect(screen.getByRole('row')).toHaveTextContent('01.01.2021')
  })

  // Kennelliitto's empty date reads as no birth day (KOE-1548): the cell says so instead of printing a placeholder.
  it('shows a dog without a birth day as unknown', () => {
    renderRow({ ...registrationWithStaticDates, dog: { ...registrationWithStaticDates.dog, dob: undefined } })

    expect(screen.getByRole('row')).not.toHaveTextContent('{{')
    expect(screen.getAllByRole('cell')[2]).toHaveTextContent('?')
  })

  const ownerCopy = { email: 'owner@example.com', membership: false, name: 'Owner Name' }

  // KOE-1599: when the owner handles, the stored handler is a copy of the owner; the handler's member
  // column reads the owner's membership, as the price and the priority do.
  it.each([undefined, true])(
    'does not mark the handler a member when a non-member owner handles (ownerHandles %s)',
    (ownerHandles) => {
      renderRow({
        ...registrationWithStaticDates,
        handler: { ...ownerCopy, membership: true },
        owner: ownerCopy,
        ownerHandles,
      })

      expect(screen.getByRole('row')).not.toHaveTextContent('✘')
    }
  )

  it("marks a separate handler by the handler's own membership", () => {
    renderRow({
      ...registrationWithStaticDates,
      handler: { email: 'handler@example.com', membership: true, name: 'Handler Name' },
      owner: ownerCopy,
      ownerHandles: false,
    })

    expect(screen.getAllByRole('cell')[9]).toHaveTextContent('✘')
  })
})
