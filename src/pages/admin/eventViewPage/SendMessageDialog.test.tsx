import type { ReactNode } from 'react'
import type { Registration } from '../../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'
import { flushPromises } from '../../../test-utils/utils'
import SendMessageDialog from './SendMessageDialog'

jest.mock('../../../api/email')
jest.mock('../../../api/event')
jest.mock('../../../api/registration')

const Wrapper = ({ children }: { readonly children: ReactNode }) => {
  return (
    <ThemeProvider theme={theme}>
      <RecoilRoot>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <SnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={<>loading...</>}>{children}</Suspense>
            </ConfirmProvider>
          </SnackbarProvider>
        </LocalizationProvider>
      </RecoilRoot>
    </ThemeProvider>
  )
}

describe('SendMessageDialog', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders hidden when open is false', async () => {
    const { container } = render(<SendMessageDialog registrations={[]} open={false} event={eventWithStaticDates} />, {
      wrapper: Wrapper,
    })
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders with minimal parameters', async () => {
    const { baseElement } = render(<SendMessageDialog registrations={[]} open={true} event={eventWithStaticDates} />, {
      wrapper: Wrapper,
    })
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })

  it('renders with all parameters', async () => {
    const registrations: Registration[] = [registrationWithStaticDates, registrationWithStaticDatesCancelled]

    const { baseElement } = render(
      <SendMessageDialog
        registrations={registrations}
        open={true}
        event={eventWithStaticDates}
        templateId="registration"
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })
})
