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
  // KOE-1736: an unofficial trial that follows NOWT may set an exercise's maximum and half points.
  describe('the scoring of an exercise', () => {
    const hankinome = testEvent({ eventType: 'Hankinome', officialFormat: 'NOWT' })
    const maxField = () => screen.getByRole('textbox', { name: 'event.exerciseMaxPoints' })
    const halves = () => screen.getByRole('checkbox', { name: 'event.exerciseHalfPoints' })

    it('sets the maximum and the half points of an unofficial trial that follows NOWT', async () => {
      const onChange = vi.fn()
      const { user } = renderComponent({ event: { ...hankinome, exerciseScoring: { maxPoints: 30 } }, onChange })

      await user.click(halves())
      expect(onChange).toHaveBeenLastCalledWith({ exerciseScoring: { halfPoints: true, maxPoints: 30 } })
    })

    it('stores no scoring of its own once the maximum is back at 20 and the halves are off', async () => {
      const onChange = vi.fn()
      const { user } = renderComponent({ event: { ...hankinome, exerciseScoring: { maxPoints: 30 } }, onChange })

      await user.clear(maxField())
      await user.type(maxField(), '20')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ exerciseScoring: null }))
    })

    it('offers no scoring of its own to an official NOWT', () => {
      renderComponent({ event: testEvent(), onChange: vi.fn() })
      expect(screen.queryByRole('checkbox', { name: 'event.exerciseHalfPoints' })).not.toBeInTheDocument()
    })

    it('keeps the scoring once a result or a turn is saved', () => {
      renderComponent({ event: hankinome, onChange: vi.fn(), scoringLocked: true })
      expect(maxField()).toBeDisabled()
      expect(halves()).toBeDisabled()
    })
  })

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

  describe('running order (KOE-1665)', () => {
    const classes = [
      { class: 'ALO' as const, date: '2026-09-12' as const },
      { class: 'AVO' as const, date: '2026-09-12' as const },
    ]
    const stations = [station('a', 1), station('b', 2)]
    const at = (...ids: string[]) => ids.map((stationId) => ({ stationId }))

    it('says every class does one exercise at each post in number order while there is no group', () => {
      renderComponent({ event: testEvent({ classes, stations }), onChange: vi.fn() })

      expect(screen.getByText('event.rotation.default')).toBeInTheDocument()
    })

    it("suggests a day's first group from that day's posts, not from another day's groups", async () => {
      const onChange = vi.fn()
      const sunday: DayKey = '2026-09-13'
      const event = testEvent({
        classes: [...classes, { class: 'VOI', date: sunday }],
        endDate: sunday,
        rotations: [{ class: 'AVO', exercises: at('b', 'a'), firstNumber: 1, lastNumber: 8 }],
        stations: [...stations, station('c', 1, { date: sunday }), station('d', 2, { date: sunday })],
      })
      const { user } = renderComponent({ event, onChange })

      await user.click(screen.getAllByRole('button', { name: 'event.rotation.add' })[1])

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          rotations: [...(event.rotations ?? []), { class: 'VOI', exercises: at('c', 'd') }],
        })
      )
    })

    it("takes a removed post's exercises out of every group, and drops a group left with none", async () => {
      const onChange = vi.fn()
      const rotations = [
        { class: 'ALO' as const, exercises: at('a', 'b', 'b') },
        { class: 'AVO' as const, exercises: at('a') },
      ]
      const { user } = renderComponent({ event: testEvent({ classes, rotations, stations }), onChange })

      await user.click(screen.getAllByRole('button', { name: 'event.stationRemove' })[0])

      expect(onChange).toHaveBeenCalledWith({
        rotations: [{ class: 'ALO', exercises: at('b', 'b') }],
        stations: [station('b', 1)],
      })
    })

    it('removes a group', async () => {
      const onChange = vi.fn()
      const rotations = [{ class: 'ALO' as const, exercises: at('a') }]
      const { user } = renderComponent({ event: testEvent({ classes, rotations, stations }), onChange })

      await user.click(screen.getByRole('button', { name: 'event.rotation.remove' }))

      expect(onChange).toHaveBeenCalledWith({ rotations: [], stations })
    })

    it('adds an exercise at the post of the last one, two in a row there', async () => {
      const onChange = vi.fn()
      const rotations = [{ class: 'ALO' as const, exercises: at('b') }]
      const { user } = renderComponent({ event: testEvent({ classes, rotations, stations }), onChange })

      await user.click(screen.getByRole('button', { name: 'event.rotation.visitAdd' }))

      expect(onChange).toHaveBeenCalledWith({ rotations: [{ class: 'ALO', exercises: at('b', 'b') }], stations })
    })

    it('shows a group stored before the running order as one without exercises, which cannot be saved until removed', async () => {
      const onChange = vi.fn()
      // A dev row of the shape #1708 wrote, posts and no exercises.
      const rotations: EventRotationGroup[] = JSON.parse('[{"class":"ALO","posts":[{"stationId":"a","taskCount":2}]}]')
      const { user } = renderComponent({ event: testEvent({ classes, rotations, stations }), onChange })

      expect(screen.queryByRole('combobox', { name: 'event.rotation.visit' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'event.rotation.remove' }))

      expect(onChange).toHaveBeenCalledWith({ rotations: [], stations })
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

/** A running order by post id, each exercise at the post's defaults. */
const exercisesAt = (...ids: string[]) => ids.map((stationId) => ({ stationId }))

/** The running orders the last patch would save. */
const savesRotations = (onChange: ReturnType<typeof vi.fn>, rotations: unknown) =>
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ rotations }))

describeWithTranslations('fi', () => {
  it("enters the organiser's map through the page, warning of a running order of other than four or five (KOE-1665)", async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(
      <Harness initial={testEvent({ classes: mapClasses, stations: mapStations })} onChange={onChange} />,
      undefined
    )
    const add = () => user.click(screen.getByRole('button', { name: 'Lisää ryhmä' }))

    await add()
    // Three exercises, one at each post, warn: a work test has four or five. The save is not refused.
    expect(screen.getByText('ALO: 3 rastia; työkokeessa on tavallisesti 4 tai 5 rastia.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lisää rasti' }))
    expect(screen.queryByText(/ALO: \d rastia/)).not.toBeInTheDocument()
    await add()
    await add()

    savesRotations(onChange, [
      { class: 'ALO', exercises: exercisesAt('r1', 'r2', 'r3', 'r3') },
      { class: 'AVO', exercises: exercisesAt('r2', 'r3', 'r1', 'r1') },
      { class: 'VOI', exercises: exercisesAt('r3', 'r1', 'r2', 'r2') },
    ])
  })

  it("stores an exercise's own dogs at once, and leaves out the post's own (KOE-1665)", async () => {
    const onChange = vi.fn()
    const initial = testEvent({
      classes: mapClasses,
      rotations: [{ class: 'ALO', exercises: exercisesAt('r1') }],
      stations: [station('r1', 1, { dogsAtOnce: 2 })],
    })
    const { user } = renderWithUserEvents(<Harness initial={initial} onChange={onChange} />, undefined)
    const exerciseField = () => screen.getAllByRole('combobox', { name: 'Koiria kerralla' }).at(-1)
    const pick = async (option: string) => {
      const field = exerciseField()
      if (field) await user.click(field)
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }))
    }

    expect(exerciseField()).toHaveTextContent('2')
    await pick('1')
    savesRotations(onChange, [{ class: 'ALO', exercises: [{ dogsAtOnce: 1, stationId: 'r1' }] }])

    await pick('2')
    savesRotations(onChange, [{ class: 'ALO', exercises: exercisesAt('r1') }])
  })

  it('puts a picked post in place of an exercise at a post the day no longer has', async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(
      <RotationRow
        classes={['ALO']}
        group={{ class: 'ALO', exercises: [{ parts: 2, stationId: 'gone' }] }}
        onChange={onChange}
        onRemove={vi.fn()}
        stations={[station('r1', 1)]}
      />,
      undefined
    )

    expect(screen.getByRole('combobox', { name: 'Koiria kerralla' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('combobox', { name: 'Rasti 1' }))
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Suorituspaikka 1' }))

    expect(onChange).toHaveBeenCalledWith({ class: 'ALO', exercises: exercisesAt('r1') })
  })

  it('shows no running order for a type not scored at posts, whose one post is the whole trial', () => {
    renderWithUserEvents(
      <Harness
        initial={testEvent({ classes: mapClasses, eventType: 'NOME-B', stations: [station('r1', 1)] })}
        onChange={vi.fn()}
      />,
      undefined
    )

    expect(screen.getByText('Suorituspaikka 1')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Suoritusjärjestys' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lisää ryhmä' })).not.toBeInTheDocument()
  })

  describe('a group row (KOE-1665)', () => {
    const one = (group: Partial<EventRotationGroup> = {}) =>
      testEvent({
        classes: mapClasses,
        rotations: [{ class: 'ALO', exercises: exercisesAt('r1', 'r2'), ...group }],
        stations: [station('r1', 1), station('r2', 2, { parts: 2 })],
      })

    it('stores a typed range, and never a number it cannot read', async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(<Harness initial={one({ lastNumber: 8 })} onChange={onChange} />, undefined)

      await user.type(screen.getByLabelText('Alkaen nro'), '3')
      savesRotations(onChange, [expect.objectContaining({ firstNumber: 3, lastNumber: 8 })])

      await user.clear(screen.getByLabelText('Alkaen nro'))
      savesRotations(onChange, [{ class: 'ALO', exercises: exercisesAt('r1', 'r2'), lastNumber: 8 }])

      await user.clear(screen.getByLabelText('Päättyen nro'))
      await user.type(screen.getByLabelText('Päättyen nro'), 'x')
      // Neither NaN nor an empty number is stored: the bound is simply absent.
      savesRotations(onChange, [{ class: 'ALO', exercises: exercisesAt('r1', 'r2') }])
    })

    it('changes the class', async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(<Harness initial={one()} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('combobox', { name: 'Luokka' }))
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'VOI' }))

      savesRotations(onChange, [expect.objectContaining({ class: 'VOI' })])
    })

    it("leaves out an exercise's parts where they are the post's own", async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(<Harness initial={one()} onChange={onChange} />, undefined)
      const exerciseFields = (name: string) => screen.getAllByRole('combobox', { name }).slice(-2)
      const pick = async (field: HTMLElement, option: string) => {
        await user.click(field)
        await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }))
      }

      // r1 is done whole by default, r2 in two parts.
      await pick(exerciseFields('Tehtäviä')[0], '2')
      await pick(exerciseFields('Tehtäviä')[1], '1')
      savesRotations(onChange, [
        expect.objectContaining({
          exercises: [
            { parts: 2, stationId: 'r1' },
            { parts: 1, stationId: 'r2' },
          ],
        }),
      ])

      await pick(exerciseFields('Tehtäviä')[0], '1')
      await pick(exerciseFields('Tehtäviä')[1], '2')
      savesRotations(onChange, [expect.objectContaining({ exercises: exercisesAt('r1', 'r2') })])
    })

    it('cannot take out the last exercise; the group goes with its own button', async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(
        <Harness initial={one({ exercises: exercisesAt('r1') })} onChange={onChange} />,
        undefined
      )

      await user.click(screen.getByRole('combobox', { name: 'Rasti 1' }))
      expect(
        within(screen.getByRole('listbox')).queryByRole('option', { name: 'Poista rasti' })
      ).not.toBeInTheDocument()
      await user.keyboard('{Escape}')

      await user.click(screen.getByRole('button', { name: 'Poista ryhmä' }))
      savesRotations(onChange, [])
    })

    it('takes out an exercise while the group keeps another', async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(<Harness initial={one()} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('combobox', { name: 'Rasti 1' }))
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Poista rasti' }))

      savesRotations(onChange, [expect.objectContaining({ exercises: exercisesAt('r2') })])
    })

    it("keeps an exercise's parts and dogs at once when its post changes, a default of the old post too", async () => {
      const onChange = vi.fn()
      const initial = testEvent({
        classes: mapClasses,
        rotations: [{ class: 'ALO', exercises: exercisesAt('r1') }],
        stations: [station('r1', 1, { dogsAtOnce: 4, parts: 2 }), station('r2', 2)],
      })
      const { user } = renderWithUserEvents(<Harness initial={initial} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('combobox', { name: 'Rasti 1' }))
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Suorituspaikka 2' }))

      savesRotations(onChange, [expect.objectContaining({ exercises: [{ dogsAtOnce: 4, parts: 2, stationId: 'r2' }] })])
    })

    it('drops a group whose class no longer runs on the day of its posts', async () => {
      const onChange = vi.fn()
      const initial = testEvent({
        classes: [{ class: 'AVO', date: '2026-09-12' }],
        rotations: [{ class: 'ALO', exercises: exercisesAt('r1') }],
        stations: mapStations,
      })
      const { user } = renderWithUserEvents(<Harness initial={initial} onChange={onChange} />, undefined)

      await user.click(screen.getByRole('button', { name: 'Lisää suorituspaikka' }))

      savesRotations(onChange, [])
    })
  })
})
