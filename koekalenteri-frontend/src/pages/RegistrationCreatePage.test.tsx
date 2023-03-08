import { ReactNode, Suspense } from 'react'
import { MemoryRouter, useParams } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { format } from 'date-fns'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates, eventWithStaticDatesAnd3Classes } from '../__mockData__/events'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { waitForDebounce } from '../test-utils/utils'

import RegistrationCreatePage from './RegistrationCreatePage'

jest.mock('../api/event')
jest.mock('../api/eventType')
jest.mock('../api/judge')
jest.mock('../api/official')
jest.mock('../api/organizer')
jest.mock('../api/registration')

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
}))
const mockUseParams = useParams as jest.Mock

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <MemoryRouter>
            <SnackbarProvider>
              <Suspense fallback={<div>loading...</div>}>
                <SnackbarProvider>{children}</SnackbarProvider>
              </Suspense>
            </SnackbarProvider>
          </MemoryRouter>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('RegistrationCreatePage', () => {
  it('should render with event/eventType/id path', async () => {
    const { eventType, id } = eventWithStaticDates
    mockUseParams.mockImplementation(() => ({ id, eventType }))
    const { container } = render(<RegistrationCreatePage />, { wrapper: Wrapper })
    await waitForDebounce()
    expect(container).toMatchSnapshot()
  })

  it('should select the class on event/eventType/id/class path', async () => {
    const { eventType, id, classes } = eventWithStaticDatesAnd3Classes
    mockUseParams.mockImplementation(() => ({ id, eventType, class: classes[1].class }))
    render(<RegistrationCreatePage />, { wrapper: Wrapper })
    await waitForDebounce()
    const input = screen.getByRole('combobox', { name: 'registration.class' })
    expect(input).toHaveValue(classes[1].class)
  })

  it('should select the date on event/eventType/id/class/date path', async () => {
    const { eventType, id, classes } = eventWithStaticDatesAnd3Classes
    const date = format(classes[2].date ?? new Date(), 'dd.MM.')
    mockUseParams.mockImplementation(() => ({ id, eventType, class: classes[2].class, date }))
    const { container } = render(<RegistrationCreatePage />, { wrapper: Wrapper })
    await waitForDebounce()
    expect(container).toMatchSnapshot()
  })

  it('should throw 404', async () => {
    mockUseParams.mockImplementation(() => ({ id: 'asdf', eventType: 'qwerty' }))
    expect.assertions(1)
    try {
      render(<RegistrationCreatePage />, { wrapper: Wrapper })
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
