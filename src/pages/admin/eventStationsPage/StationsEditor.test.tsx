import type { EventStation } from '../../../types'
import type { Props, StationsEditorEvent } from './StationsEditor'
import { TZDate } from '@date-fns/tz'
import { screen } from '@testing-library/react'
import { TIME_ZONE } from '../../../i18n/dates'
import { renderWithUserEvents } from '../../../test-utils/utils'
import StationsEditor from './StationsEditor'

const station = (id: string, number: number, overrides: Partial<EventStation> = {}): EventStation => ({
  date: new TZDate('2026-09-12', TIME_ZONE),
  id,
  number,
  tasks: 1,
  ...overrides,
})

const testEvent = (overrides: Partial<StationsEditorEvent> = {}): StationsEditorEvent => ({
  endDate: new TZDate('2026-09-12', TIME_ZONE),
  eventType: 'NOWT',
  judges: [],
  startDate: new TZDate('2026-09-12', TIME_ZONE),
  ...overrides,
})

const renderComponent = (props: Props) => renderWithUserEvents(<StationsEditor {...props} />, undefined)

describe('StationsEditor', () => {
  it('renders a row for each post', () => {
    renderComponent({
      event: testEvent({ stations: [station('a', 1), station('b', 2)] }),
      onChange: vi.fn(),
    })

    expect(screen.getByText('event.station 1')).toBeInTheDocument()
    expect(screen.getByText('event.station 2')).toBeInTheDocument()
  })

  it('adds a post with a single task by default', async () => {
    const onChange = vi.fn()
    const { user } = renderComponent({ event: testEvent({ stations: [station('a', 1)] }), onChange })

    await user.click(screen.getByRole('button', { name: 'event.stationAdd' }))

    expect(onChange).toHaveBeenCalledWith({
      stations: [station('a', 1), expect.objectContaining({ number: 2, tasks: 1 })],
    })
  })

  it('renumbers the remaining posts when one is removed', async () => {
    const onChange = vi.fn()
    const { user } = renderComponent({
      event: testEvent({ stations: [station('a', 1), station('b', 2), station('c', 3)] }),
      onChange,
    })

    await user.click(screen.getAllByRole('button', { name: 'event.stationRemove' })[0])

    // 'b' and 'c' keep their identity but move up, so the posts still read 1..n.
    expect(onChange).toHaveBeenCalledWith({ stations: [station('b', 1), station('c', 2)] })
  })

  it('numbers each day from one, since every day is built as its own course', async () => {
    const onChange = vi.fn()
    const saturday = new TZDate('2026-09-12', TIME_ZONE)
    const sunday = new TZDate('2026-09-13', TIME_ZONE)
    const { user } = renderComponent({
      event: testEvent({
        endDate: sunday,
        stations: [station('a', 1, { date: saturday }), station('b', 2, { date: saturday })],
      }),
      onChange,
    })

    // The second day's own "add" button, below its (empty) list.
    await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[1])

    expect(onChange).toHaveBeenCalledWith({
      stations: [
        station('a', 1, { date: saturday }),
        station('b', 2, { date: saturday }),
        expect.objectContaining({ number: 1 }),
      ],
    })
  })

  it('renumbers only within the day a post was removed from', async () => {
    const onChange = vi.fn()
    const saturday = new TZDate('2026-09-12', TIME_ZONE)
    const sunday = new TZDate('2026-09-13', TIME_ZONE)
    const { user } = renderComponent({
      event: testEvent({
        endDate: sunday,
        stations: [
          station('a', 1, { date: saturday }),
          station('b', 2, { date: saturday }),
          station('c', 1, { date: sunday }),
        ],
      }),
      onChange,
    })

    await user.click(screen.getAllByRole('button', { name: 'event.stationRemove' })[0])

    // Saturday's remaining post becomes 1; Sunday's is untouched.
    expect(onChange).toHaveBeenCalledWith({
      stations: [station('b', 1, { date: saturday }), station('c', 1, { date: sunday })],
    })
  })

  it('hides a judge who has been dropped from the event roster', () => {
    const judge = { id: 1, name: 'Lappalainen Mika', official: true }
    renderComponent({
      event: testEvent({ judges: [], stations: [station('a', 1, { judges: [judge] })] }),
      onChange: vi.fn(),
    })

    expect(screen.queryByText('Lappalainen Mika')).not.toBeInTheDocument()
  })
})
