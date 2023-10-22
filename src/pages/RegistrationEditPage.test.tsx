import type { ReactNode } from 'react'

import { Suspense } from 'react'
import { MemoryRouter, useParams } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationWithStaticDates } from '../__mockData__/registrations'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { flushPromisesAndTimers } from '../test-utils/utils'

import RegistrationEditPage from './RegistrationEditPage'

jest.mock('../api/user')
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
  afterEach(() => jest.clearAllTimers())
  afterAll(() => jest.useRealTimers())

  it('should render', async () => {
    const { eventId, id } = registrationWithStaticDates
    mockUseParams.mockImplementation(() => ({ id: eventId, registrationId: id }))
    const { container } = render(<RegistrationEditPage />, { wrapper: Wrapper })
    await flushPromisesAndTimers()
    await flushPromisesAndTimers()
    expect(container).toMatchSnapshot()
  })

  xit('should throw 404 when event is not found', async () => {
    mockUseParams.mockImplementation(() => ({ id: 'asdf', registrationId: 'qwerty' }))
    await expect(async () => {
      render(<RegistrationEditPage />, { wrapper: Wrapper })
      await flushPromisesAndTimers()
      await flushPromisesAndTimers()
    }).rejects.toMatchInlineSnapshot(`
        Response {
          "_bodyInit": "Event not found",
          "_bodyText": "Event not found",
          "bodyUsed": false,
          "headers": Headers {
            "map": {
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
  })
})
