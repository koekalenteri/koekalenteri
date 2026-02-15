import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter, useParams } from 'react-router'
import { RecoilRoot } from 'recoil'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { flushPromises } from '../test-utils/utils'
import RegistrationEditPage from './RegistrationEditPage'

jest.mock('../api/user')
jest.mock('../api/event')
jest.mock('../api/eventType')
jest.mock('../api/judge')
jest.mock('../api/official')
jest.mock('../api/organizer')
jest.mock('../api/registration')

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  Link: jest.fn().mockImplementation(() => <>link</>),
  useNavigate: jest.fn(),
  useParams: jest.fn(),
}))
const mockUseParams = useParams as jest.Mock

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <MemoryRouter>{children} </MemoryRouter>
            </SnackbarProvider>
          </Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('RegistrationEditPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render', async () => {
    const { eventId, id } = registrationWithStaticDates
    mockUseParams.mockImplementation(() => ({ id: eventId, registrationId: id }))
    const { container } = render(<RegistrationEditPage />, { wrapper: Wrapper })
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})
