import { ThemeProvider } from '@mui/material'
import { act, fireEvent, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { getEventTypes, putEventType } from '../../api/eventType'
import theme from '../../assets/Theme'
import { flushPromises, renderSuspended, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventTypeListPage from './EventTypeListPage'

vi.mock('../../api/eventType')
vi.mock('../../api/user')

describe('EventTypeListPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  const renderPage = () =>
    renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <EventTypeListPage />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )

  it('renders', async () => {
    await renderPage()
    await flushPromises()
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(
      expect.arrayContaining(['eventType.eventType', 'official', 'active', 'eventType.description'])
    )
    expect(screen.getByText('TEST1')).toBeInTheDocument()
  })

  it('saves an event type switched active', async () => {
    await renderPage()
    await flushPromises()

    await act(async () => {
      fireEvent.click(screen.getByRole('switch'))
    })
    await flushPromises()

    expect(putEventType).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, eventType: 'TEST1' }),
      TEST_ID_TOKEN
    )
  })

  it('fetches the event types again on refresh', async () => {
    await renderPage()
    await flushPromises()
    vi.mocked(getEventTypes).mockClear()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /updateData/ }))
    })
    await flushPromises()

    expect(getEventTypes).toHaveBeenCalledWith(TEST_ID_TOKEN, true)
  })
})
