import type { ReactNode } from 'react'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'
import { flushPromises } from '../../../test-utils/utils'

import RegistrationEditDialog from './RegistrationEditDialog'

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

describe('RegistrationEditDialog', () => {
  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-03-20T12:30:00.000Z'))
  })
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

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
