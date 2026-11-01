import type { DayKey, EventStation } from '@/types'
import type { Props, StationsEditorEvent } from './StationsEditor'
import { screen } from '@testing-library/react'
import { renderWithUserEvents } from '@/test-utils/utils'
import StationsEditor from './StationsEditor'

const station = (id: string, number: number, overrides: Partial<EventStation> = {}): EventStation => ({
  date: '2026-09-12',
  id,
  number,
  parts: 1,
  ...overrides,
})

const testEvent = (overrides: Partial<StationsEditorEvent> = {}): StationsEditorEvent => ({
  classes: [],
  endDate: '2026-09-12',
  eventType: 'NOWT',
  judges: [],
  startDate: '2026-09-12',
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
      rotations: [],
      stations: [station('a', 1), expect.objectContaining({ number: 2, parts: 1 })],
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
    expect(onChange).toHaveBeenCalledWith({ rotations: [], stations: [station('b', 1), station('c', 2)] })
  })

  it('numbers each day from one, since every day is built as its own course', async () => {
    const onChange = vi.fn()
    const saturday: DayKey = '2026-09-12'
    const sunday: DayKey = '2026-09-13'
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
      rotations: [],
      stations: [
        station('a', 1, { date: saturday }),
        station('b', 2, { date: saturday }),
        expect.objectContaining({ number: 1 }),
      ],
    })
  })

  it('renumbers only within the day a post was removed from', async () => {
    const onChange = vi.fn()
    const saturday: DayKey = '2026-09-12'
    const sunday: DayKey = '2026-09-13'
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
      rotations: [],
      stations: [station('b', 1, { date: saturday }), station('c', 1, { date: sunday })],
    })
  })

  it('saves a post stored with the old name of its split under the new one (KOE-1665)', async () => {
    const onChange = vi.fn()
    const legacy: EventStation = { date: '2026-09-12', id: 'a', number: 1, tasks: 2 }
    const { user } = renderComponent({ event: testEvent({ stations: [legacy] }), onChange })

    await user.click(screen.getByRole('button', { name: 'event.stationAdd' }))

    expect(onChange).toHaveBeenCalledWith({
      rotations: [],
      stations: [station('a', 1, { parts: 2 }), expect.objectContaining({ number: 2, parts: 1 })],
    })
  })

  describe('rotation (KOE-1665)', () => {
    const classes = [
      { class: 'ALO' as const, date: '2026-09-12' as const },
      { class: 'AVO' as const, date: '2026-09-12' as const },
    ]
    const stations = [station('a', 1), station('b', 2)]

    it('says every class goes round the posts in number order while there is no group', () => {
      renderComponent({ event: testEvent({ classes, stations }), onChange: vi.fn() })

      expect(screen.getByText('event.rotation.default')).toBeInTheDocument()
    })

    it('adds a group for the first class without one, visiting the posts in number order', async () => {
      const onChange = vi.fn()
      const rotations = [{ class: 'ALO' as const, posts: [{ stationId: 'b' }, { stationId: 'a' }] }]
      const { user } = renderComponent({ event: testEvent({ classes, rotations, stations }), onChange })

      await user.click(screen.getByRole('button', { name: 'event.rotation.add' }))

      expect(onChange).toHaveBeenCalledWith({
        rotations: [...rotations, { class: 'AVO', posts: [{ stationId: 'a' }, { stationId: 'b' }] }],
        stations,
      })
    })

    it('takes a removed post out of every group, and drops a group left with none', async () => {
      const onChange = vi.fn()
      const rotations = [
        { class: 'ALO' as const, posts: [{ stationId: 'a' }, { stationId: 'b', taskCount: 2 }] },
        { class: 'AVO' as const, posts: [{ stationId: 'a' }] },
      ]
      const { user } = renderComponent({ event: testEvent({ classes, rotations, stations }), onChange })

      await user.click(screen.getAllByRole('button', { name: 'event.stationRemove' })[0])

      expect(onChange).toHaveBeenCalledWith({
        rotations: [{ class: 'ALO', posts: [{ stationId: 'b', taskCount: 2 }] }],
        stations: [station('b', 1)],
      })
    })

    it('removes a group', async () => {
      const onChange = vi.fn()
      const rotations = [{ class: 'ALO' as const, posts: [{ stationId: 'a' }] }]
      const { user } = renderComponent({ event: testEvent({ classes, rotations, stations }), onChange })

      await user.click(screen.getByRole('button', { name: 'event.rotation.remove' }))

      expect(onChange).toHaveBeenCalledWith({ rotations: [], stations })
    })

    it('adds the next post the group does not visit yet', async () => {
      const onChange = vi.fn()
      const rotations = [{ class: 'ALO' as const, posts: [{ stationId: 'b' }] }]
      const { user } = renderComponent({ event: testEvent({ classes, rotations, stations }), onChange })

      await user.click(screen.getByRole('button', { name: 'event.rotation.visitAdd' }))

      expect(onChange).toHaveBeenCalledWith({
        rotations: [{ class: 'ALO', posts: [{ stationId: 'b' }, { stationId: 'a' }] }],
        stations,
      })
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
