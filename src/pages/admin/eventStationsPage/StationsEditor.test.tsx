import type { DayKey, DogEvent, EventRotationGroup, EventStation, Patch } from '@/types'
import type { Props, StationsEditorEvent } from './StationsEditor'
import { screen, within } from '@testing-library/react'
import { useState } from 'react'
import { merge } from '@/lib/utils'
import { describeWithTranslations } from '@/test-utils/language'
import { renderWithUserEvents } from '@/test-utils/utils'
import { RotationRow } from './RotationRow'
import StationsEditor from './StationsEditor'

vi.mock('react-i18next', async (importOriginal) =>
  (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
)

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

    it("adds the day's first group for the first class, visiting the posts in number order", async () => {
      const onChange = vi.fn()
      const { user } = renderComponent({ event: testEvent({ classes, stations: [...stations].reverse() }), onChange })

      await user.click(screen.getByRole('button', { name: 'event.rotation.add' }))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ rotations: [{ class: 'ALO', posts: [{ stationId: 'a' }, { stationId: 'b' }] }] })
      )
    })

    it("suggests a day's first group from that day's posts, not from another day's groups", async () => {
      const onChange = vi.fn()
      const sunday: DayKey = '2026-09-13'
      const event = testEvent({
        classes: [...classes, { class: 'VOI', date: sunday }],
        endDate: sunday,
        rotations: [{ class: 'AVO', firstNumber: 1, lastNumber: 8, posts: [{ stationId: 'b' }, { stationId: 'a' }] }],
        stations: [...stations, station('c', 1, { date: sunday }), station('d', 2, { date: sunday })],
      })
      const { user } = renderComponent({ event, onChange })

      await user.click(screen.getAllByRole('button', { name: 'event.rotation.add' })[1])

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          rotations: [...(event.rotations ?? []), { class: 'VOI', posts: [{ stationId: 'c' }, { stationId: 'd' }] }],
        })
      )
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

/**
 * The editor as the page holds it: every patch is merged into the event it shows next, so a sequence of
 * picks builds on the one before, and the last patch is what the page would save.
 */
const Harness = ({
  initial,
  onChange,
}: {
  readonly initial: StationsEditorEvent
  readonly onChange: Props['onChange']
}) => {
  const [event, setEvent] = useState(initial)
  return (
    <StationsEditor
      event={event}
      onChange={(patch: Patch<DogEvent>) => {
        // Merged the way the page merges it (EventStationsPage), arrays replaced whole.
        setEvent((previous) => merge<StationsEditorEvent>(previous, patch))
        onChange?.(patch)
      }}
    />
  )
}

const mapClasses = [
  { class: 'ALO' as const, date: '2026-09-12' as const },
  { class: 'AVO' as const, date: '2026-09-12' as const },
  { class: 'VOI' as const, date: '2026-09-12' as const },
]
const mapStations = [station('r1', 1), station('r2', 2), station('r3', 3)]

/** The rotation the last patch would save. */
const savesRotations = (onChange: ReturnType<typeof vi.fn>, rotations: unknown) =>
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ rotations }))

describeWithTranslations('fi', () => {
  it("enters the organiser's map through the page: each new group goes round from the next post (KOE-1665)", async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(
      <Harness initial={testEvent({ classes: mapClasses, stations: mapStations })} onChange={onChange} />,
      undefined
    )
    const pick = async (label: RegExp | string, at: number, option: string) => {
      await user.click(screen.getAllByRole('combobox', { name: label })[at])
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }))
    }
    const add = () => user.click(screen.getByRole('button', { name: 'Lisää kiertoryhmä' }))

    await add()
    // The posts' own "Tehtäviä" come first; the first group's last visit does two tasks.
    await pick(/^Tehtäviä$/, mapStations.length + 2, '2')
    await add()
    await add()

    savesRotations(onChange, [
      { class: 'ALO', posts: [{ stationId: 'r1' }, { stationId: 'r2' }, { stationId: 'r3', taskCount: 2 }] },
      { class: 'AVO', posts: [{ stationId: 'r2' }, { stationId: 'r3' }, { stationId: 'r1', taskCount: 2 }] },
      { class: 'VOI', posts: [{ stationId: 'r3' }, { stationId: 'r1' }, { stationId: 'r2', taskCount: 2 }] },
    ])

    // The map turns the other way round: AVO starts at post 3 and VOI at post 2.
    await pick('Luokka', 1, 'VOI')
    await pick('Luokka', 2, 'AVO')
    expect(screen.getByText('Rasti 1: ALO, AVO, VOI (x 2)')).toBeInTheDocument()
    expect(screen.getByText('Rasti 2: VOI, ALO, AVO (x 2)')).toBeInTheDocument()
    expect(screen.getByText('Rasti 3: AVO, VOI, ALO (x 2)')).toBeInTheDocument()
  })

  it("stores a group's own dogs at once at a post, and leaves out the post's own (KOE-1665)", async () => {
    const onChange = vi.fn()
    const initial = testEvent({
      classes: mapClasses,
      rotations: [{ class: 'ALO', posts: [{ stationId: 'r1' }] }],
      stations: [station('r1', 1, { dogsAtOnce: 2 })],
    })
    const { user } = renderWithUserEvents(<Harness initial={initial} onChange={onChange} />, undefined)
    const visitField = () => screen.getAllByRole('combobox', { name: 'Koiria kerralla' }).at(-1)
    const pick = async (option: string) => {
      const field = visitField()
      if (field) await user.click(field)
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }))
    }

    expect(visitField()).toHaveTextContent('2')
    await pick('1')
    savesRotations(onChange, [{ class: 'ALO', posts: [{ dogsAtOnce: 1, stationId: 'r1' }] }])

    await pick('2')
    savesRotations(onChange, [{ class: 'ALO', posts: [{ stationId: 'r1' }] }])
  })

  it('puts a picked post in place of a visit to a post the day no longer has', async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(
      <RotationRow
        classes={['ALO']}
        group={{ class: 'ALO', posts: [{ stationId: 'gone', taskCount: 2 }] }}
        onChange={onChange}
        onRemove={vi.fn()}
        stations={[station('r1', 1)]}
      />,
      undefined
    )

    expect(screen.getByRole('combobox', { name: 'Koiria kerralla' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('combobox', { name: '1. rasti' }))
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Rasti 1' }))

    expect(onChange).toHaveBeenCalledWith({ class: 'ALO', posts: [{ stationId: 'r1' }] })
  })

  it('shows no rotation for a type not scored at posts, whose one post is the whole trial', () => {
    renderWithUserEvents(
      <Harness
        initial={testEvent({ classes: mapClasses, eventType: 'NOME-B', stations: [station('r1', 1)] })}
        onChange={vi.fn()}
      />,
      undefined
    )

    expect(screen.getByText('Rasti 1')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kierto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lisää kiertoryhmä' })).not.toBeInTheDocument()
  })

  describe('a group row (KOE-1665)', () => {
    const one = (group: Partial<EventRotationGroup> = {}) =>
      testEvent({
        classes: mapClasses,
        rotations: [{ class: 'ALO', posts: [{ stationId: 'r1' }, { stationId: 'r2' }], ...group }],
        stations: [station('r1', 1), station('r2', 2, { parts: 2, taskCount: 2 })],
      })

    it('stores a typed range, and never a number it cannot read', async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(<Harness initial={one({ lastNumber: 8 })} onChange={onChange} />, undefined)

      await user.type(screen.getByLabelText('Alkaen nro'), '3')
      savesRotations(onChange, [expect.objectContaining({ firstNumber: 3, lastNumber: 8 })])

      await user.clear(screen.getByLabelText('Alkaen nro'))
      savesRotations(onChange, [{ class: 'ALO', lastNumber: 8, posts: [{ stationId: 'r1' }, { stationId: 'r2' }] }])

      await user.clear(screen.getByLabelText('Päättyen nro'))
      await user.type(screen.getByLabelText('Päättyen nro'), 'x')
      // Neither NaN nor an empty number is stored: the bound is simply absent.
      savesRotations(onChange, [{ class: 'ALO', posts: [{ stationId: 'r1' }, { stationId: 'r2' }] }])
    })

    it('changes the class', async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(<Harness initial={one()} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('combobox', { name: 'Luokka' }))
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'VOI' }))

      savesRotations(onChange, [expect.objectContaining({ class: 'VOI' })])
    })

    it("keeps a visit's tasks with its post when the round is reordered", async () => {
      const onChange = vi.fn()
      const initial = one({ posts: [{ stationId: 'r1', taskCount: 3 }, { stationId: 'r2' }] })
      const { user } = renderWithUserEvents(<Harness initial={initial} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('combobox', { name: '1. rasti' }))
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Rasti 2' }))

      savesRotations(onChange, [
        expect.objectContaining({ posts: [{ stationId: 'r2' }, { stationId: 'r1', taskCount: 3 }] }),
      ])
    })

    it("leaves out a visit's task count and parts where they are the post's own", async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(<Harness initial={one()} onChange={onChange} />, undefined)
      const visitFields = (name: string) => screen.getAllByRole('combobox', { name }).slice(-2)
      const pick = async (field: HTMLElement, option: string) => {
        await user.click(field)
        await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }))
      }

      // r1 does one task whole by default, r2 two tasks in two parts.
      await pick(visitFields('Tehtäviä')[0], '2')
      await pick(visitFields('Osajako')[1], '1')
      savesRotations(onChange, [
        expect.objectContaining({
          posts: [
            { stationId: 'r1', taskCount: 2 },
            { parts: 1, stationId: 'r2' },
          ],
        }),
      ])

      await pick(visitFields('Tehtäviä')[0], '1')
      await pick(visitFields('Osajako')[1], '2')
      savesRotations(onChange, [expect.objectContaining({ posts: [{ stationId: 'r1' }, { stationId: 'r2' }] })])
    })

    it('cannot take out the last visit; the group goes with its own button', async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(
        <Harness initial={one({ posts: [{ stationId: 'r1' }] })} onChange={onChange} />,
        undefined
      )

      await user.click(screen.getByRole('combobox', { name: '1. rasti' }))
      expect(within(screen.getByRole('listbox')).queryByRole('option', { name: 'Ei rastia' })).not.toBeInTheDocument()
      await user.keyboard('{Escape}')

      await user.click(screen.getByRole('button', { name: 'Poista kiertoryhmä' }))
      savesRotations(onChange, [])
    })

    it('takes out a visit while the group keeps another', async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(<Harness initial={one()} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('combobox', { name: '1. rasti' }))
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Ei rastia' }))

      savesRotations(onChange, [expect.objectContaining({ posts: [{ stationId: 'r2' }] })])
    })

    it('keeps what the group does at a point of its round when a post it does not visit takes the place', async () => {
      const onChange = vi.fn()
      const initial = testEvent({
        classes: mapClasses,
        rotations: [{ class: 'ALO', posts: [{ stationId: 'r1' }, { parts: 2, stationId: 'r2', taskCount: 2 }] }],
        stations: mapStations,
      })
      const { user } = renderWithUserEvents(<Harness initial={initial} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('combobox', { name: '2. rasti' }))
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Rasti 3' }))

      // A swap moves a visit whole with its post; a new post takes over the visit's own settings.
      savesRotations(onChange, [
        expect.objectContaining({ posts: [{ stationId: 'r1' }, { parts: 2, stationId: 'r3', taskCount: 2 }] }),
      ])
    })

    it('keeps what a column shows when a post it does not visit takes the place, a default of the old post too', async () => {
      const onChange = vi.fn()
      const initial = testEvent({
        classes: mapClasses,
        rotations: [{ class: 'ALO', posts: [{ stationId: 'r1' }] }],
        stations: [station('r1', 1, { dogsAtOnce: 4, taskCount: 2 }), station('r2', 2)],
      })
      const { user } = renderWithUserEvents(<Harness initial={initial} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('combobox', { name: '1. rasti' }))
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Rasti 2' }))

      savesRotations(onChange, [expect.objectContaining({ posts: [{ dogsAtOnce: 4, stationId: 'r2', taskCount: 2 }] })])
    })

    it('drops a group whose class no longer runs on the day of its posts', async () => {
      const onChange = vi.fn()
      const initial = testEvent({
        classes: [{ class: 'AVO', date: '2026-09-12' }],
        rotations: [{ class: 'ALO', posts: [{ stationId: 'r1' }] }],
        stations: mapStations,
      })
      const { user } = renderWithUserEvents(<Harness initial={initial} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('button', { name: 'Lisää rasti' }))

      savesRotations(onChange, [])
    })
  })
})
