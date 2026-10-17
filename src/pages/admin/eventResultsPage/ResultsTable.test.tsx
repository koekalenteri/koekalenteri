import type { Registration } from '@/types'
import type { ResultEdit } from '../../components/stationScoring/types'
import { render, screen } from '@testing-library/react'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import { classRound, placementsFor } from '@/lib/results'
import ResultsTable from './ResultsTable'

const round = classRound(eventWithStations.stations ?? [])
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
      fullRound={round}
      judgesFor={() => []}
      onChange={() => {}}
      onJudgeChange={() => {}}
      placements={placements}
      registrations={registrations}
      round={round}
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
