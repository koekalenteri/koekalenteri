import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'
import { flushPromises, TEST_ID_TOKEN } from '../../../test-utils/utils'
import { idTokenAtom } from '../../state'
import RegistrationEditDialog from './RegistrationEditDialog'

vi.mock('../../../api/email')
vi.mock('../../../api/event')
vi.mock('../../../api/registration')
vi.mock('../../../api/user')

const Wrapper = ({ children }: { readonly children: ReactNode }) => {
  return (
    <ThemeProvider theme={theme}>
      <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <SnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={<>loading...</>}>{children}</Suspense>
            </ConfirmProvider>
          </SnackbarProvider>
        </LocalizationProvider>
      </Provider>
    </ThemeProvider>
  )
}

describe('RegistrationEditDialog', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-03-20T12:30:00.000Z'))
  })
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders hidden when open is false', async () => {
    const { container } = render(
      <RegistrationEditDialog
        event={eventWithStaticDates}
        open={false}
        registrationId={registrationWithStaticDates.id}
      />,
      {
        wrapper: Wrapper,
      }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders with minimal parameters', async () => {
    const { baseElement } = render(
      <RegistrationEditDialog
        event={eventWithStaticDates}
        open={true}
        registrationId={registrationWithStaticDates.id}
      />,
      {
        wrapper: Wrapper,
      }
    )
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })

  it('renders when registration is cancelled', async () => {
    const { baseElement } = render(
      <RegistrationEditDialog
        event={eventWithStaticDates}
        open={true}
        registrationId={registrationWithStaticDatesCancelled.id}
      />,
      {
        wrapper: Wrapper,
      }
    )
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
    expect(screen.getByRole('dialog')).toHaveTextContent('PERUTTU: ')
  })
})
