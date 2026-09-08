import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { InfoBox } from './InfoBox'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', width: 480 }}>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </div>
)

const noop = () => {}

// Paid 123 at the member price and found not to be a member: the place costs 130 now, and the
// status line names the 7 still missing instead of reading as paid (KOE-722).
it('names the part of the fee still missing', async () => {
  const screen = await render(
    <Frame>
      <InfoBox
        event={{ ...eventWithStaticDates, cost: 130, costMember: 123, paymentTime: 'registration' }}
        registration={{ ...registrationWithStaticDates, shouldPay: true }}
        onConfirm={noop}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Maksusta puuttuu 7,00 €')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('info-box-part-missing')
})
