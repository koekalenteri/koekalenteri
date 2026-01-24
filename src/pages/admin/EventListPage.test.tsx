import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import theme from '../../assets/Theme'
import { flushPromises, RecoilObserver, renderWithUserEvents } from '../../test-utils/utils'
import EventListPage from './EventListPage'
import { adminEventIdAtom } from './recoil'

jest.mock('../../api/event')
jest.mock('../../api/judge')
jest.mock('../../api/organizer')
jest.mock('../../api/registration')
jest.mock('../../api/user')

describe('EventListPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders', async () => {
    const onChange = jest.fn()
    const { container, user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <RecoilObserver node={adminEventIdAtom} onChange={onChange} />
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <EventListPage />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()

    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)

    await user.click(rows[1])
    await flushPromises()

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(onChange).toHaveBeenCalledWith('testEntryClosed')
  })
})
