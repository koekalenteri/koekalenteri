import type { Registration } from '@/types'
import type { ResultEdit } from '../../components/stationScoring/types'
import { render, screen } from '@testing-library/react'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import { placementsFor, resolveEventResult } from '@/lib/results'
import { dogRound, roundColumns } from '@/lib/resultTasks'
import { rotationDogOf } from '@/lib/rotation'
import { describeWithTranslations } from '@/test-utils/language'
import ResultsTable from './ResultsTable'

vi.mock('react-i18next', async (importOriginal) =>
  (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
)

// Every dog of the fixture is one group, so one round stands for all of them.
const round = dogRound(eventWithStations, rotationDogOf(registrationsToEventWithStations[0]))
const roundOf = () => round
const at = new Date('2021-02-10T10:00:00Z')

const stored = (points: number, result: string): Registration['eventResult'] => ({
  maxPoints: 40,
  points,
  result,
  updatedAt: at,
  updatedBy: 'Rasti 1',
})

const [first, second] = registrationsToEventWithStations
const registrations: Registration[] = [
  { ...first, eventResult: stored(40, 'ALO1') },
  { ...second, eventResult: stored(25, 'ALO3') },
]

const judge = { id: 223, name: 'Tuomari 2', official: true }

let judges: (typeof judge)[] = []

const renderTable = (
  edits: Record<string, ResultEdit>,
  placements?: ReadonlyMap<string, number>,
  rows: Registration[] = registrations
) =>
  render(
    <ResultsTable
      defaultJudges={{}}
      edits={edits}
      eventClass="ALO"
      eventType="NOWT"
      fullRoundFor={roundOf}
      judgesFor={() => judges}
      onChange={() => {}}
      onJudgeChange={() => {}}
      placements={placements}
      registrations={rows}
      round={round}
      roundFor={roundOf}
      wholeRoundFor={roundOf}
      stations={eventWithStations.stations ?? []}
    />
  )

describe('ResultsTable layout', () => {
  afterEach(() => {
    judges = []
  })

  it('names the lone judge of a post once, in the column heading, not on every row', () => {
    judges = [judge]
    renderTable({})

    expect(screen.getAllByText(judge.name)).toHaveLength(round.length)
    for (const heading of screen.getAllByRole('columnheader', { name: /results\.column\.task/ })) {
      expect(heading).toHaveTextContent(judge.name)
    }
  })

  it('leaves the headings without a judge where a post has several, since the choice is on the row', () => {
    judges = [judge, { id: 224, name: 'Tuomari 3', official: true }]
    renderTable({})

    for (const heading of screen.getAllByRole('columnheader', { name: /results\.column\.task/ })) {
      expect(heading).not.toHaveTextContent(/Tuomari/)
    }
  })

  it('keeps the interruption control named for a screen reader while it is a lone dash', () => {
    renderTable({})

    expect(screen.getAllByRole('combobox', { name: /results\.(interruption|outcome)/ })).toHaveLength(2)
  })

  it('shows the registration number with the handler, without a stray separator when it is missing', () => {
    const [withNumber, withoutNumber] = registrations
    renderTable({}, undefined, [withNumber, { ...withoutNumber, dog: { ...withoutNumber.dog, regNo: '' } }])

    expect(screen.getByText(`${withNumber.dog.regNo} · ${withNumber.handler?.name}`)).toBeInTheDocument()
    expect(screen.getByText(`${withoutNumber.handler?.name}`)).toBeInTheDocument()
  })
})

describe('ResultsTable placement', () => {
  it('shows a rank under the prize of each awarded dog', () => {
    renderTable({}, placementsFor(registrations))

    expect(screen.getAllByText(/results\.placement/)).toHaveLength(2)
  })

  it('shows none on the row that has an unsaved edit, and keeps the others', () => {
    renderTable({ [first.id]: { tasks: [] } }, placementsFor(registrations))

    expect(screen.getAllByText(/results\.placement/)).toHaveLength(1)
  })

  it('shows none at all without placements, as in a post of its own', () => {
    renderTable({})

    expect(screen.queryByText(/results\.placement/)).not.toBeInTheDocument()
  })
})

const renderGroups = (orders: [string[], string[]]) => {
  const event = {
    ...eventWithStations,
    rotations: orders.map((order, at) => ({
      class: 'ALO' as const,
      exercises: order.map((stationId) => ({ parts: 1 as const, stationId })),
      firstNumber: at === 0 ? 1 : 2,
      lastNumber: at === 0 ? 1 : 9,
    })),
  }
  const roundFor = (registration: Registration) => dogRound(event, rotationDogOf(registration))
  render(
    <ResultsTable
      defaultJudges={{}}
      edits={{}}
      eventClass="ALO"
      eventType="NOWT"
      judgesFor={() => []}
      onChange={() => {}}
      onJudgeChange={() => {}}
      registrations={registrations}
      round={roundColumns(registrations.map(roundFor))}
      roundFor={roundFor}
      wholeRoundFor={roundFor}
      stations={eventWithStations.stations ?? []}
    />
  )
}

describe('ResultsTable rotation groups (KOE-1665)', () => {
  it('leaves a column empty on the row of a dog whose group has no such slot', () => {
    const [onlyFirst, onlySecond] = [round.slice(0, 1), round.slice(1, 2)]
    render(
      <ResultsTable
        defaultJudges={{}}
        edits={{}}
        eventClass="ALO"
        eventType="NOWT"
        judgesFor={() => []}
        onChange={() => {}}
        onJudgeChange={() => {}}
        registrations={registrations}
        round={[...onlyFirst, ...onlySecond]}
        roundFor={(registration) => (registration.id === first.id ? onlyFirst : onlySecond)}
        wholeRoundFor={roundOf}
        stations={eventWithStations.stations ?? []}
      />
    )

    // Two columns, two dogs, one score field each.
    expect(screen.getAllByRole('columnheader', { name: /results\.column\.task/ })).toHaveLength(2)
    expect(screen.getAllByLabelText(/results\.column\.task/)).toHaveLength(2)
  })
})

describeWithTranslations('fi', () => {
  it('names a column "Rasti n" whatever post the group did the exercise at (KOE-1665)', () => {
    renderGroups([
      ['post-1', 'post-2'],
      ['post-2', 'post-1'],
    ])

    expect(screen.getAllByRole('columnheader', { name: /^Rasti \d$/ }).map((cell) => cell.textContent)).toEqual([
      'Rasti 1',
      'Rasti 2',
    ])
  })
})

describe('ResultsTable result spelling', () => {
  it('shows a NOME-A result as Kennelliitto lists it, without the format in front (KOE-1592)', () => {
    const nomeA: Registration[] = [
      {
        ...first,
        class: undefined,
        eventResult: { result: 'NOME-A1', updatedAt: at, updatedBy: 'Sihteeri' },
        eventType: 'NOME-A',
      },
    ]
    render(
      <ResultsTable
        defaultJudges={{}}
        edits={{}}
        eventClass="NOME-A"
        eventType="NOME-A"
        judgesFor={() => []}
        onChange={() => {}}
        onJudgeChange={() => {}}
        registrations={nomeA}
        round={[]}
        roundFor={() => []}
        wholeRoundFor={() => []}
        stations={[]}
      />
    )

    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.queryByText('NOME-A1')).not.toBeInTheDocument()
  })
})

describe('ResultsTable after a round that ended early (KOE-1669)', () => {
  const task = (exercise: number, part: number, points: number | null) => ({ exercise, part, points })
  const retired = (exercise: number | undefined, tasks = [task(1, 0, 12)]): ResultEdit => ({
    retirement: { cause: 'handlerChoice', ...(exercise ? { exercise } : {}) },
    tasks,
  })
  const renderOne = (edit: ResultEdit, scope?: string) => {
    const roundFor = scope ? () => round.filter((slot) => slot.stationId === scope) : roundOf
    render(
      <ResultsTable
        defaultJudges={{}}
        edits={{ [first.id]: edit }}
        eventClass="ALO"
        eventType="NOWT"
        fullRoundFor={scope ? undefined : roundOf}
        judgesFor={() => []}
        onChange={() => {}}
        onJudgeChange={() => {}}
        registrations={[first]}
        round={roundFor()}
        roundFor={roundFor}
        stationId={scope}
        stations={eventWithStations.stations ?? []}
        wholeRoundFor={roundOf}
      />
    )
  }

  it('shows the posts after the stop as kesk and keeps the posts up to it as inputs', () => {
    renderOne(retired(1))

    // Post 1 is one task, post 2 one task in two parts.
    expect(screen.getAllByText('results.notReached')).toHaveLength(2)
    expect(screen.getAllByLabelText(/results\.column\.task/)).toHaveLength(1)
    expect(screen.getByLabelText(/results\.column\.task/)).toBeEnabled()
  })

  it('shows kesk in a post of its own the same way as in the whole round', () => {
    renderOne(retired(1), 'post-2')

    expect(screen.getAllByText('results.notReached')).toHaveLength(2)
    expect(screen.queryByLabelText(/results\.column\.task/)).not.toBeInTheDocument()
  })

  it('marks nothing and locks nothing where the post of the stop is not known', () => {
    renderOne(retired(undefined))

    expect(screen.queryByText('results.notReached')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText(/results\.column\.task/)).toHaveLength(3)
  })

  it('keeps a score stored after the stop as an input, since it counts and may need clearing', () => {
    renderOne(retired(1, [task(1, 0, 12), task(2, 0, 7)]))

    expect(screen.getAllByText('results.notReached')).toHaveLength(1)
    expect(screen.getAllByLabelText(/results\.column\.task/)).toHaveLength(2)
  })
})

describeWithTranslations('fi', () => {
  it('shows the total of a round that ended early as the server stores it (KOE-1669)', () => {
    const tasks = [
      { exercise: 1, part: 0, points: 12 },
      { exercise: 2, part: 1, points: 5 },
    ]
    const retirement = { cause: 'injury', exercise: 2 } as const
    // The server's tasks carry who stored them; that does not enter the total.
    const stamped = tasks.map((task) => ({ ...task, updatedAt: '', updatedBy: '' }))
    const stored = resolveEventResult({ retirement, tasks: stamped }, { eventClass: 'ALO', eventType: 'NOWT', round })
    render(
      <ResultsTable
        defaultJudges={{}}
        edits={{ [first.id]: { retirement, tasks } }}
        eventClass="ALO"
        eventType="NOWT"
        fullRoundFor={roundOf}
        judgesFor={() => []}
        onChange={() => {}}
        onJudgeChange={() => {}}
        registrations={[first]}
        round={round}
        roundFor={roundOf}
        stations={eventWithStations.stations ?? []}
        wholeRoundFor={roundOf}
      />
    )

    expect(stored).toMatchObject({ maxPoints: 40, points: 17, result: 'ALO-' })
    expect(screen.getByText(`${stored.points} / ${stored.maxPoints}`)).toBeInTheDocument()
    expect(screen.getByText('ALO-')).toBeInTheDocument()
    expect(screen.getByText('Kesk.')).toBeInTheDocument()
  })
})
