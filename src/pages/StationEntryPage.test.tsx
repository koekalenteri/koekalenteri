import type { RouteObject } from 'react-router'
import type { StationEntry } from '../types'
import { ThemeProvider } from '@mui/material'
import { cleanup, screen, within } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { getStationEntry, putStationEntry } from '../api/station'
import theme from '../assets/Theme'
import { Path } from '../routeConfig'
import { DataMemoryRouter, flushPromises, renderWithUserEvents } from '../test-utils/utils'
import { Component as StationEntryPage } from './StationEntryPage'

vi.mock('../api/station')

const entry = (): StationEntry => ({
  event: {
    classes: [],
    endDate: new Date('2026-09-12T12:00:00Z'),
    eventType: 'NOWT',
    id: 'event-1',
    location: 'Ranua',
    name: 'Syyskoe',
    startDate: new Date('2026-09-12T12:00:00Z'),
  },
  registrations: [
    {
      class: 'AVO',
      dog: { name: 'Ensimmainen' },
      eventType: 'NOWT',
      group: { date: new Date('2026-09-12T12:00:00Z'), key: 'AVO-AP', number: 1, time: 'ap' },
      id: 'run-1',
    },
    {
      class: 'AVO',
      dog: { name: 'Toinen' },
      eventType: 'NOWT',
      group: { date: new Date('2026-09-12T12:00:00Z'), key: 'AVO-AP', number: 2, time: 'ap' },
      id: 'run-2',
    },
  ],
  station: { date: new Date('2026-09-12T12:00:00Z'), id: 'post-1', number: 1, tasks: 1 },
})

const renderPage = () => {
  const routes: RouteObject[] = [{ element: <StationEntryPage />, path: 'station/:eventId/:stationId/access/:token' }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <SnackbarProvider>
        <DataMemoryRouter initialEntries={[Path.stationEntry('event-1', 'post-1', 'link-token')]} routes={routes} />
      </SnackbarProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

describe('StationEntryPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('opens the station view with the link token', async () => {
    vi.mocked(getStationEntry).mockResolvedValue(entry())
    renderPage()
    await flushPromises()

    expect(getStationEntry).toHaveBeenCalledWith('event-1', 'post-1', 'link-token', expect.anything())
    expect(screen.getByText(/event.station/)).toBeInTheDocument()
    expect(screen.getByText(/1 Ensimmainen/)).toBeInTheDocument()
    expect(screen.getByText(/2 Toinen/)).toBeInTheDocument()
  })

  it('saves through the link, scoped to this station', async () => {
    vi.mocked(getStationEntry).mockResolvedValue(entry())
    const { user } = renderPage()
    await flushPromises()

    await user.click(screen.getByText(/1 Ensimmainen/))
    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], '17')
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    expect(putStationEntry).toHaveBeenCalledTimes(1)
    const [eventId, stationId, submissions, token] = vi.mocked(putStationEntry).mock.calls[0]
    expect(eventId).toBe('event-1')
    expect(stationId).toBe('post-1')
    expect(token).toBe('link-token')
    expect(submissions[0]).toMatchObject({
      eventResult: { tasks: [{ index: 0, points: 17, stationId: 'post-1' }] },
      id: 'run-1',
      stationId: 'post-1',
    })
  })

  it('reads the same for a wrong, revoked or expired link', async () => {
    vi.mocked(getStationEntry).mockRejectedValue(new Error('not found'))
    renderPage()
    await flushPromises()

    expect(screen.getByText('results.stationLinkInvalid')).toBeInTheDocument()
    expect(within(document.body).queryByRole('tab')).not.toBeInTheDocument()
  })
})
