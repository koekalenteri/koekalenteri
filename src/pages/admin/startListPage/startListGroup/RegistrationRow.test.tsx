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
})
