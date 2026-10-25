import { render, screen, within } from '@testing-library/react'
import JudgeWorkloadTable from './JudgeWorkloadTable'

const bodyRows = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    )

describe('JudgeWorkloadTable', () => {
  it('lists each judge with held, upcoming and total events, busiest first', () => {
    render(
      <JudgeWorkloadTable
        data={[
          { held: 1, judgeId: '1', name: 'Matti Meikäläinen', upcoming: 1 },
          { held: 2, judgeId: '2', name: 'Maija Mallikas', upcoming: 1 },
          { held: 0, judgeId: '3', name: 'Ahola Pauliina', upcoming: 2 },
        ]}
      />
    )

    expect(
      within(screen.getAllByRole('row')[0])
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)
    ).toEqual([
      'judge',
      'stats.admin.judgeHeldEvents',
      'stats.admin.judgeUpcomingEvents',
      'stats.admin.judgeTotalEvents',
    ])
    expect(bodyRows()).toEqual([
      ['Maija Mallikas', '2', '1', '3'],
      ['Ahola Pauliina', '0', '2', '2'],
      ['Matti Meikäläinen', '1', '1', '2'],
    ])
  })

  it('keeps judges sharing a display name as separate rows', () => {
    render(
      <JudgeWorkloadTable
        data={[
          { held: 4, judgeId: '1', name: 'Matti Meikäläinen', upcoming: 0 },
          { held: 2, judgeId: 'Matti Meikäläinen', name: 'Matti Meikäläinen', upcoming: 0 },
        ]}
      />
    )

    expect(bodyRows()).toEqual([
      ['Matti Meikäläinen', '4', '0', '4'],
      ['Matti Meikäläinen', '2', '0', '2'],
    ])
  })

  it('shows a placeholder when there is no data', () => {
    render(<JudgeWorkloadTable data={[]} />)

    expect(screen.getByText('stats.admin.noJudgeData')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
