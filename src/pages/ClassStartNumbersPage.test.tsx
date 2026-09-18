import type { RouteObject } from 'react-router'
import type { ClassStartNumbers } from '../types'
import { ThemeProvider } from '@mui/material'
import { cleanup, screen, within } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { getClassStartNumbers, putClassStartNumbers } from '../api/startNumbers'
import theme from '../assets/Theme'
import { Path } from '../routeConfig'
import { DataMemoryRouter, flushPromises, renderWithUserEvents } from '../test-utils/utils'
import { Component as ClassStartNumbersPage } from './ClassStartNumbersPage'

vi.mock('../api/startNumbers')

const day = new Date('2026-09-12T12:00:00Z')

/** ALO holds 1–2 of the working order; AVO's 3–4 are not this link's to see. */
const entry = (): ClassStartNumbers => ({
  event: {
    classes: [{ class: 'ALO', date: day }],
    endDate: day,
    eventType: 'NOWT',
    id: 'event-1',
    location: 'Ranua',
    name: 'Syyskoe',
    startDate: day,
  },
  eventClass: 'ALO',
  registrations: [
    {
      class: 'ALO',
      dog: { name: 'Ensimmainen', regNo: 'REG-1' },
      eventType: 'NOWT',
      group: { date: day, key: 'ALO-AP', number: 1, time: 'ap' },
      handler: { name: 'Ohjaaja 1' },
      id: 'alo-1',
    },
    {
      class: 'ALO',
      dog: { name: 'Toinen', regNo: 'REG-2' },
      eventType: 'NOWT',
      group: { date: day, key: 'ALO-AP', number: 2, time: 'ap' },
      handler: { name: 'Ohjaaja 2' },
      id: 'alo-2',
    },
  ],
  reserved: [],
})

const renderPage = () => {
  const routes: RouteObject[] = [
    { element: <ClassStartNumbersPage />, path: 'start-numbers/:eventId/:eventClass/access/:token' },
  ]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <SnackbarProvider>
        <DataMemoryRouter initialEntries={[Path.classStartNumbers('event-1', 'ALO', 'link-token')]} routes={routes} />
      </SnackbarProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

describe('ClassStartNumbersPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('opens the class sheet with the link token', async () => {
    vi.mocked(getClassStartNumbers).mockResolvedValue(entry())
    renderPage()
    await flushPromises()

    expect(getClassStartNumbers).toHaveBeenCalledWith('event-1', 'ALO', 'link-token', expect.anything())
    expect(screen.getByText('Ensimmainen')).toBeInTheDocument()
    expect(screen.getByText('Toinen')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ALO' })).toBeInTheDocument()
  })

  it('saves the drawn numbers through the link, scoped to this class', async () => {
    vi.mocked(getClassStartNumbers).mockResolvedValue(entry())
    // The server answers with the whole placement, not the bare number: the day is what keeps the
    // dog on its own row of the sheet.
    vi.mocked(putClassStartNumbers).mockResolvedValue({
      patches: [{ id: 'alo-1', startGroup: { date: day, key: 'ALO-AP', number: 2, time: 'ap' } }],
    })
    const { user } = renderPage()
    await flushPromises()

    await user.type(screen.getAllByRole('textbox')[0], '2')
    await flushPromises()
    await user.click(screen.getByRole('button', { name: /startNumbers.save/ }))
    await flushPromises()

    expect(putClassStartNumbers).toHaveBeenCalledWith('event-1', 'ALO', [{ id: 'alo-1', startNumber: 2 }], 'link-token')
    // The write's answer is the only thing that reaches a link, so the saved number is on the sheet.
    const row = screen.getByText('Ensimmainen').closest('tr')
    if (!row) throw new Error('row not found')
    expect(within(row).getByRole('textbox')).toHaveValue('2')
  })

  /**
   * The working order is recomputed while a drawn number stays frozen, so a number this class holds
   * can already be another class's dog's. The link is served that class and nothing else, and until
   * KOE-1267 the collision first showed as a refused save over a sheet where nothing looked wrong.
   */
  it('marks a number another class has already drawn, and says which class', async () => {
    vi.mocked(getClassStartNumbers).mockResolvedValue({ ...entry(), reserved: [{ eventClass: 'AVO', number: 2 }] })
    const { user } = renderPage()
    await flushPromises()

    const row = screen.getByText('Ensimmainen').closest('tr')
    if (!row) throw new Error('row not found')

    await user.type(within(row).getByRole('textbox'), '2')
    await flushPromises()

    expect(within(row).getByText('startNumbers.reservedInClass eventClass')).toBeInTheDocument()
    // Nothing is wrong with a number the class still holds.
    await user.clear(within(row).getByRole('textbox'))
    await user.type(within(row).getByRole('textbox'), '1')
    await flushPromises()
    expect(within(row).queryByText(/startNumbers.reserved/)).not.toBeInTheDocument()
  })

  it('reads the same for a wrong, revoked or expired link', async () => {
    vi.mocked(getClassStartNumbers).mockRejectedValue(new Error('not found'))
    renderPage()
    await flushPromises()

    expect(screen.getByText('startNumbers.linkInvalid')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})
