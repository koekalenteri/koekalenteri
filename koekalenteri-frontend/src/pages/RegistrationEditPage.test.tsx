import { ReactNode, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationWithStaticDates } from '../__mockData__/registrations'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { waitForDebounce } from '../test-utils/utils'

import RegistrationEditPage from './RegistrationEditPage'

jest.mock('../api/event')
jest.mock('../api/eventType')
jest.mock('../api/judge')
jest.mock('../api/official')
jest.mock('../api/organizer')
jest.mock('../api/registration')

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
  useParams: jest.fn(),
  Link: jest.fn().mockImplementation(() => <>link</>),
}))
const mockUseNavigate = useNavigate as jest.Mock
const mockUseParams = useParams as jest.Mock
const mockNavigate = jest.fn()

mockUseNavigate.mockImplementation(() => mockNavigate)

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <SnackbarProvider>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>{children}</SnackbarProvider>
            </Suspense>
          </SnackbarProvider>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('RegistrationEditPage', () => {
  it('should render', async () => {
    const { eventId, id } = registrationWithStaticDates
    mockUseParams.mockImplementation(() => ({ id: eventId, registrationId: id }))
    const { container } = render(<RegistrationEditPage />, { wrapper: Wrapper })
    await waitForDebounce()
    expect(container).toMatchSnapshot()
  })

  xit('should throw 404 when event is not found', async () => {
    mockUseParams.mockImplementation(() => ({ id: 'asdf', registrationId: 'qwerty' }))
    expect.assertions(1)
    try {
      render(<RegistrationEditPage />, { wrapper: Wrapper })
      await waitForDebounce()
    } catch (e) {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(e).toMatchInlineSnapshot(`
        Response {
          "_bodyInit": "Event not found",
          "_bodyText": "Event not found",
          "bodyUsed": false,
          "headers": Headers {
            "map": Object {
              "content-type": "text/plain;charset=UTF-8",
            },
          },
          "ok": false,
          "status": 404,
          "statusText": "error.eventNotFound",
          "type": "default",
          "url": "",
        }
      `)
    }
  })
})