import { ThemeProvider } from '@mui/material'
import { fireEvent, render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import theme from '../../assets/Theme'
import { flushPromises, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import OrganizerListPage from './OrganizerListPage'
import { adminOrganizerIdAtom } from './state'

vi.mock('../../api/organizer')
vi.mock('../../api/user')

describe('OrganizerListPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders', async () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <OrganizerListPage />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('keeps the page mounted when a row is selected', async () => {
    // A suspending read of the selected row would swap the whole page for the Suspense fallback,
    // dropping the grid's scroll position and focus on every selection.
    const Fallback = vi.fn(() => <div>loading...</div>)
    render(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            // localStorage survives from the previous test; start with nothing selected so the click changes it.
            set(adminOrganizerIdAtom, '')
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<Fallback />}>
              <SnackbarProvider>
                <OrganizerListPage />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()
    const fallbackRendersWhileLoading = Fallback.mock.calls.length

    // fireEvent commits the click's render before the microtask queue runs, the way a browser does.
    const rows = screen.getAllByRole('row')
    fireEvent.click(rows[1])
    await flushPromises()

    expect(rows[1]).toHaveClass('Mui-selected')
    expect(Fallback).toHaveBeenCalledTimes(fallbackRendersWhileLoading)
  })
})
