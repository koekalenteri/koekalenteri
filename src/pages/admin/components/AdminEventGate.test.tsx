import type { User } from '@/types'
import { ThemeProvider } from '@mui/material'
import { act, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '@/__mockData__/events'
import { getUser } from '@/api/user'
import theme from '@/assets/Theme'
import { idTokenAtom } from '@/pages/state'
import { flushPromises, renderSuspended, TEST_ID_TOKEN } from '@/test-utils/utils'
import { adminEventsAtom } from '../state'
import { AdminEventGate } from './AdminEventGate'

vi.mock('@/api/event')
vi.mock('@/api/user')

const renderGate = (eventId: string, seedList: boolean) =>
  renderSuspended(
    <ThemeProvider theme={theme}>
      <Provider
        initializeState={({ set }) => {
          set(idTokenAtom, TEST_ID_TOKEN)
          if (seedList) set(adminEventsAtom, [eventWithStaticDates])
        }}
      >
        <Suspense fallback={<div>loading...</div>}>
          <MemoryRouter initialEntries={[`/event/${eventId}`]}>
            <Routes>
              <Route
                path="/event/:id"
                element={
                  <AdminEventGate>
                    <div>the event page</div>
                  </AdminEventGate>
                }
              />
            </Routes>
          </MemoryRouter>
        </Suspense>
      </Provider>
    </ThemeProvider>
  )

describe('AdminEventGate', () => {
  // KOE-1738: a secretary who opened another club's trial got a spinner or "something went wrong",
  // since the page read the trial's entries (403) before finding the trial was not theirs.
  it('shows that the event is not found, and not the page, for an event not on the admin list', async () => {
    await renderGate('another-clubs-event', true)

    expect(screen.getByText('error.eventNotFound')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'backToEventsList' })).toBeInTheDocument()
    expect(screen.queryByText('the event page')).not.toBeInTheDocument()
  })

  it('shows the page for an event on the admin list', async () => {
    await renderGate(eventWithStaticDates.id, true)

    expect(screen.getByText('the event page')).toBeInTheDocument()
    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
  })

  // The real event must never flash "not found" while the list is still on its way.
  it('waits for the admin list before deciding', async () => {
    let resolveUser: (user: User) => void = () => {}
    vi.mocked(getUser).mockReturnValueOnce(
      new Promise<User>((resolve) => {
        resolveUser = resolve
      })
    )
    await renderGate(eventWithStaticDates.id, false)

    expect(screen.getByText('loading...')).toBeInTheDocument()
    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
    expect(screen.queryByText('the event page')).not.toBeInTheDocument()

    await act(async () => resolveUser({ admin: true, email: 'a@b.fi', id: 'admin', name: 'Admin' }))
    await flushPromises()

    expect(screen.getByText('the event page')).toBeInTheDocument()
  })
})
