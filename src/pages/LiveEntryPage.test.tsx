import type { RouteObject } from 'react-router'
import type { StationEntry } from '../types'
import { ThemeProvider } from '@mui/material'
import { cleanup, screen, within } from '@testing-library/react'
import { APIError } from '../api/http'
import { getStationEntry, putStationEntry } from '../api/station'
import theme from '../assets/Theme'
import { Path } from '../routeConfig'
import { expectConsoleOutput } from '../test-utils/consoleGuard'
import { DataMemoryRouter, flushPromises, renderWithUserEvents } from '../test-utils/utils'
import AppSnackbarProvider from './components/AppSnackbarProvider'
import { Component as LiveEntryPage } from './LiveEntryPage'

vi.mock('../api/station')

const entry = (): StationEntry => ({
  event: {
    classes: [],
    endDate: '2026-09-12',
    eventType: 'NOWT',
    id: 'event-1',
    location: 'Ranua',
    name: 'Syyskoe',
    startDate: '2026-09-12',
  },
  registrations: [
    {
      class: 'AVO',
      dog: { name: 'Ensimmainen' },
      eventType: 'NOWT',
      group: { date: '2026-09-12', key: 'AVO-AP', number: 1, time: 'ap' },
      id: 'run-1',
    },
    {
      class: 'AVO',
      dog: { name: 'Toinen' },
      eventType: 'NOWT',
      group: { date: '2026-09-12', key: 'AVO-AP', number: 2, time: 'ap' },
      id: 'run-2',
    },
  ],
  station: { date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 },
})

const renderPage = () => {
  const routes: RouteObject[] = [{ element: <LiveEntryPage />, path: 'live-entry/:eventId/:stationId/access/:token' }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <AppSnackbarProvider>
        <DataMemoryRouter initialEntries={[Path.liveEntry('event-1', 'post-1', 'link-token')]} routes={routes} />
      </AppSnackbarProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

describe('LiveEntryPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('opens the live entry with the link token', async () => {
    vi.mocked(getStationEntry).mockResolvedValue(entry())
    renderPage()
    await flushPromises()

    expect(getStationEntry).toHaveBeenCalledWith('event-1', 'post-1', 'link-token', expect.anything())
    expect(screen.getByText(/event.station/)).toBeInTheDocument()
    expect(screen.getByText(/1 Ensimmainen/)).toBeInTheDocument()
    expect(screen.getByText(/2 Toinen/)).toBeInTheDocument()
    // StationScoring names the post; the page adds no second h1 of its own.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('saves through the link, scoped to this post', async () => {
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

    expect(screen.getByText('results.liveEntryLinkInvalid')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'results.liveEntryTitle' })).toBeInTheDocument()
    expect(within(document.body).queryByRole('tab')).not.toBeInTheDocument()
  })
  it('cannot be saved once the trial is with the chief judge, which the link learns from the trial it opens', async () => {
    vi.mocked(getStationEntry).mockResolvedValue({ ...entry(), event: { ...entry().event, locked: true } })
    const { user } = renderPage()
    await flushPromises()

    await user.click(screen.getByRole('button', { name: /1 Ensimmainen/ }))

    expect(screen.getByText('results.kennelliitto.lockedLive')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
  })
  it('reads the day’s list again when a save names a dog the trial no longer has, and keeps the scores on screen', async () => {
    vi.mocked(getStationEntry).mockResolvedValue(entry())
    vi.mocked(putStationEntry).mockRejectedValueOnce(new APIError(new Response(null, { status: 422 }), 'did not run'))
    expectConsoleOutput(/reportError .*422/)
    const { user } = renderPage()
    await flushPromises()
    vi.mocked(getStationEntry).mockClear()

    await user.click(screen.getByRole('button', { name: /1 Ensimmainen/ }))
    await user.type(screen.getAllByRole('textbox')[0], '10')
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    expect(screen.getByText('results.saveFailed')).toBeInTheDocument()
    expect(getStationEntry).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('10')
  })
})
