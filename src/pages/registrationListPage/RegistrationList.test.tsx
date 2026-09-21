import type { PublicDogEvent } from '../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import RegistrationList from './RegistrationList'

const noop = () => {}

/** Paying at entry; the fee is what the trial says it is. */
const eventCosting = (cost: number): PublicDogEvent => ({
  ...eventWithStaticDates,
  cost,
  costMember: cost,
  paymentTime: 'registration',
})

const renderList = (event: PublicDogEvent) =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <RegistrationList event={event} rows={[registrationWithStaticDates]} onUnregister={noop} />
      </MemoryRouter>
    </ThemeProvider>
  )

// registrationWithStaticDates has paid 123 and its payment succeeded. Paying stays on the row as a
// button beside the menu (KOE-973); only editing and cancelling are behind it.
describe('RegistrationList', () => {
  it('offers paying again when the fee rose above what was paid (KOE-722)', () => {
    renderList(eventCosting(130))

    expect(screen.getByRole('button', { name: 'registration.actions.pay' })).toBeInTheDocument()
  })

  it('does not offer paying a fee that has been paid as it reads', () => {
    renderList(eventCosting(123))

    expect(screen.queryByRole('button', { name: 'registration.actions.pay' })).not.toBeInTheDocument()
  })
})
