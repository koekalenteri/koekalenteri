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

vi.mock('../api/user')
vi.mock('../api/event')
vi.mock('../api/eventType')
vi.mock('../api/judge')
vi.mock('../api/official')
vi.mock('../api/organizer')
vi.mock('../api/registration')

vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  Link: vi.fn().mockImplementation(() => <>link</>),
  useNavigate: vi.fn(),
  useParams: vi.fn(),
}))
const mockUseParams = useParams as import('vitest').Mock

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
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render', async () => {
    const { eventId, id } = registrationWithStaticDates
    mockUseParams.mockImplementation(() => ({ id: eventId, registrationId: id }))
    const { container } = render(<RegistrationEditPage />, { wrapper: Wrapper })
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})
