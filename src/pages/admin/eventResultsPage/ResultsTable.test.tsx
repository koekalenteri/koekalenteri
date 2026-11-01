import type { Registration } from '@/types'
import type { ResultEdit } from '../../components/stationScoring/types'
import { render, screen } from '@testing-library/react'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import { dogRound, placementsFor, roundColumns } from '@/lib/results'
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

const renderTable = (edits: Record<string, ResultEdit>, placements?: ReadonlyMap<string, number>) =>
  render(
    <ResultsTable
      defaultJudges={{}}
      edits={edits}
      eventClass="ALO"
      eventType="NOWT"
      fullRoundFor={roundOf}
      judgesFor={() => []}
      onChange={() => {}}
      onJudgeChange={() => {}}
      placements={placements}
      registrations={registrations}
      round={round}
      roundFor={roundOf}
      stations={eventWithStations.stations ?? []}
    />
  )

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
        stations={[]}
      />
    )

    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.queryByText('NOME-A1')).not.toBeInTheDocument()
  })
})
