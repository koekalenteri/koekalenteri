import type { ReactNode } from 'react'
import type { PublicConfirmedEvent } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDates } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { flushPromises } from '../../test-utils/utils'
import RegistrationEventInfo from './RegistrationEventInfo'

jest.mock('../../api/event')
jest.mock('../../api/judge')

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <Suspense fallback={<div>loading...</div>}>{children}</Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('RegistrationEventInfo', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders', async () => {
    const { container } = render(
      <RegistrationEventInfo event={eventWithStaticDates} invitationAttachment={undefined} />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    expect(screen.getByText('event.official')).toBeInTheDocument()
    expect(screen.getByText('Teemu Toimitsija, 040-official, official@example.com')).toBeInTheDocument()
    expect(screen.getByText('event.secretary')).toBeInTheDocument()
    expect(screen.getByText('Siiri Sihteeri, 040-secretary, secretary@example.com')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('does not render empty contact info', async () => {
    const event: PublicConfirmedEvent = {
      ...eventWithStaticDates,
      contactInfo: { official: {} },
    }
    const { container } = render(<RegistrationEventInfo event={event} invitationAttachment={undefined} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    expect(screen.queryByText('event.official:')).toBeNull()
    expect(screen.queryByText('event.secretary:')).toBeNull()
    expect(container).toMatchSnapshot()
  })
})
