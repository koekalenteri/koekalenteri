import type { ReactNode } from 'react'
import type { PublicConfirmedEvent } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { Suspense } from 'react'
import { eventWithStaticDates } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { flushPromises } from '../../test-utils/utils'
import RegistrationEventInfo from './RegistrationEventInfo'

vi.mock('../../api/event')
vi.mock('../../api/judge')

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Provider>
          <Suspense fallback={<div>loading...</div>}>{children}</Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('RegistrationEventInfo', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

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

  it('shows the invitation attachment when the registration class is invited', async () => {
    const event: PublicConfirmedEvent = {
      ...eventWithStaticDates,
      classes: [{ class: 'ALO', date: eventWithStaticDates.startDate, state: 'invited' }],
      state: 'confirmed',
    }

    render(
      <RegistrationEventInfo
        event={event}
        eventClass="ALO"
        invitationAttachment="alo-attachment"
        invitationAttachmentUpdatedAt={new Date('2026-07-28T10:00:00.000Z')}
      />,
      {
        wrapper: Wrapper,
      }
    )
    await flushPromises()

    expect(screen.getByText('koekutsu-20210210-NOU-ALO.pdf').closest('a')).toHaveAttribute(
      'href',
      expect.stringContaining('/file/alo-attachment/koekutsu-20210210-NOU-ALO.pdf')
    )
    expect(screen.getByText('invitation.attachmentUpdated date')).toBeInTheDocument()
  })
})
