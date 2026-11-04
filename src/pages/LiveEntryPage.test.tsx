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
      visit: { exercise: 1, exercisePosts: ['post-1'], parts: 1 },
    },
    {
      class: 'AVO',
      dog: { name: 'Toinen' },
      eventType: 'NOWT',
      group: { date: '2026-09-12', key: 'AVO-AP', number: 2, time: 'ap' },
      id: 'run-2',
      visit: { exercise: 1, exercisePosts: ['post-1'], parts: 1 },
    },
  ],
  station: { date: '2026-09-12', id: 'post-1', number: 1 },
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
    // The link's holder has no account: nothing here leads to the admin side (KOE-1699).
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
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
      eventResult: { tasks: [{ exercise: 1, part: 0, points: 17 }] },
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

  // The link has no socket: the 409 is the only way it hears of another writer, and it is raw JSON (KOE-1697).
  describe('a save that lost to another writer', () => {
    const read = new Date('2026-09-12T10:00:00.000Z')
    const beaten = '2026-09-12T10:05:00.000Z'
    const stored = { tasks: [{ exercise: 1, part: 0, points: 15, updatedAt: beaten }], updatedAt: beaten }
    const conflict = () =>
      new APIError(new Response(null, { status: 409 }), {
        conflicts: [{ id: 'run-1', stationId: 'post-1', stored, submitted: stored }],
        error: 'resultConflict',
        saved: [],
        unchanged: [],
      })
    const withScore = (): StationEntry => {
      const opened = entry()
      const [first, second] = opened.registrations
      return {
        ...opened,
        registrations: [
          { ...first, eventResult: { tasks: [{ exercise: 1, part: 0, points: 11, updatedAt: read }] } },
          second,
        ],
      }
    }
    const saveIntoConflict = async () => {
      vi.mocked(getStationEntry).mockResolvedValue(withScore())
      vi.mocked(putStationEntry).mockRejectedValueOnce(conflict())
      const { user } = renderPage()
      await flushPromises()
      vi.mocked(getStationEntry).mockClear()
      vi.mocked(putStationEntry).mockClear()

      await user.click(screen.getByRole('button', { name: /1 Ensimmainen/ }))
      await user.click(screen.getByRole('button', { name: 'results.save' }))
      await flushPromises()
      expect(screen.getByText('results.conflictTitle')).toBeInTheDocument()
      return user
    }

    it('folds the stored version in on choosing it, so the next save is based on it without reading the day', async () => {
      const user = await saveIntoConflict()

      await user.click(screen.getByRole('button', { name: 'results.conflictResolve' }))
      await flushPromises()

      expect(screen.queryByText('results.conflictTitle')).not.toBeInTheDocument()
      expect(screen.getAllByRole('textbox')[0]).toHaveValue('15')
      expect(getStationEntry).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'results.save' }))
      await flushPromises()

      expect(putStationEntry).toHaveBeenLastCalledWith(
        'event-1',
        'post-1',
        [expect.objectContaining({ basedOn: new Date(beaten) })],
        'link-token'
      )
    })

    it('leaves the old version on cancel, so the next save is refused again rather than overwriting', async () => {
      const user = await saveIntoConflict()
      vi.mocked(putStationEntry).mockRejectedValueOnce(conflict())

      await user.click(screen.getByRole('button', { name: 'cancel' }))
      await flushPromises()
      await user.click(screen.getByRole('button', { name: 'results.save' }))
      await flushPromises()

      expect(putStationEntry).toHaveBeenLastCalledWith(
        'event-1',
        'post-1',
        [expect.objectContaining({ basedOn: read })],
        'link-token'
      )
      expect(screen.getByText('results.conflictTitle')).toBeInTheDocument()
    })
  })

  // The link has no socket: the save's refusal is the only way it hears of a new running order (KOE-1694).
  describe('a save refused because the running order changed', () => {
    const staleData = () =>
      new APIError(new Response(null, { status: 409 }), { error: 'staleData', message: 'layout changed' })
    const chips = () =>
      screen.getAllByRole('button', { name: /^\d (Ensimmainen|Toinen)/ }).map((chip) => chip.textContent)
    const saveFirstDog = async (user: ReturnType<typeof renderPage>['user']) => {
      await user.click(screen.getByRole('button', { name: /1 Ensimmainen/ }))
      await user.type(screen.getAllByRole('textbox')[0], '10')
      await user.click(screen.getByRole('button', { name: 'results.save' }))
      await flushPromises()
    }

    it('reads the day’s list again and shows the new order', async () => {
      vi.mocked(getStationEntry).mockResolvedValue(entry())
      vi.mocked(putStationEntry).mockRejectedValueOnce(staleData())
      const { user } = renderPage()
      await flushPromises()
      expect(chips()).toEqual(['1 Ensimmainen', '2 Toinen'])

      vi.mocked(getStationEntry).mockClear()
      const [first, second] = entry().registrations
      vi.mocked(getStationEntry).mockResolvedValue({
        ...entry(),
        registrations: [{ ...second, group: { date: '2026-09-12', key: 'AVO-AP', number: 1, time: 'ap' } }, first],
      })
      await saveFirstDog(user)

      expect(screen.getByText('results.layoutChanged')).toBeInTheDocument()
      expect(getStationEntry).toHaveBeenCalledTimes(1)
      expect(chips()).toEqual(['1 Toinen', '1 Ensimmainen'])
      expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
    })

    it('still says what happened, and stays on the list it has, when the read fails too', async () => {
      vi.mocked(getStationEntry).mockResolvedValue(entry())
      vi.mocked(putStationEntry).mockRejectedValueOnce(staleData())
      const { user } = renderPage()
      await flushPromises()

      vi.mocked(getStationEntry).mockRejectedValueOnce(new Error('Network Error'))
      expectConsoleOutput(/reportError .*Network Error/)
      await saveFirstDog(user)

      expect(screen.getByText('results.layoutChanged')).toBeInTheDocument()
      expect(screen.queryByText('results.liveEntryLinkInvalid')).not.toBeInTheDocument()
      expect(chips()).toEqual(['1 Ensimmainen', '2 Toinen'])
    })
  })
})
