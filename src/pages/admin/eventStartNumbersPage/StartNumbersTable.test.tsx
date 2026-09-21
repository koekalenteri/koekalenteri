import type { StartNumberRow } from './StartNumbersTable'
import { TZDate } from '@date-fns/tz'
import { render, screen } from '@testing-library/react'
import { StartNumbersTable } from './StartNumbersTable'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'registration.timeLong.ap') return 'aamupäivä'
      if (key === 'registration.timeLong.ip') return 'iltapäivä'
      if (key === 'dateFormat.wdshort') return 'pe 4.9.'
      return key
    },
  }),
}))

const friday = new TZDate(2026, 8, 4, 'Europe/Helsinki')

const row = (id: string, time: 'ap' | 'ip'): StartNumberRow => ({
  dog: { name: `Dog ${id}`, regNo: `REG-${id}` },
  groupNumber: Number(id.slice(-1)),
  handler: { name: 'Handler' },
  id,
  placement: { date: friday, time },
})

describe('StartNumbersTable', () => {
  // The halves are drawn and published one at a time (KOE-1430), so the sheet has to show where the
  // morning ends: a heading per half, and the rows name only the day.
  it('heads a sheet that holds both a morning and an afternoon, and names only the day on its rows', () => {
    render(
      <StartNumbersTable
        drafts={{}}
        onChange={() => {}}
        rows={[row('run-1', 'ap'), row('run-2', 'ap'), row('run-3', 'ip')]}
      />
    )

    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells.filter((text) => text === 'aamupäivä')).toHaveLength(1)
    expect(cells.filter((text) => text === 'iltapäivä')).toHaveLength(1)
    expect(cells.filter((text) => text === 'pe 4.9.')).toHaveLength(3)
    // The morning's heading comes before its rows, the afternoon's before the last.
    expect(cells.indexOf('aamupäivä')).toBeLessThan(cells.indexOf('Dog run-1'))
    expect(cells.indexOf('Dog run-2')).toBeLessThan(cells.indexOf('iltapäivä'))
    expect(cells.indexOf('iltapäivä')).toBeLessThan(cells.indexOf('Dog run-3'))
  })

  it('keeps the half on the row where the sheet is one half only', () => {
    render(<StartNumbersTable drafts={{}} onChange={() => {}} rows={[row('run-1', 'ap'), row('run-2', 'ap')]} />)

    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells.filter((text) => text === 'pe 4.9. aamupäivä')).toHaveLength(2)
    expect(cells.filter((text) => text === 'aamupäivä')).toHaveLength(0)
  })

  // On a phone the placement folds under the dog's name (KOE-1282); the heading spans the two columns.
  it('heads the folded phone sheet the same way', () => {
    render(
      <StartNumbersTable compact drafts={{}} onChange={() => {}} rows={[row('run-1', 'ap'), row('run-3', 'ip')]} />
    )

    expect(screen.getByText('aamupäivä')).toHaveAttribute('colspan', '2')
    expect(screen.getByText('iltapäivä')).toHaveAttribute('colspan', '2')
    expect(screen.getByText('REG-run-1 · Handler · pe 4.9.')).toBeInTheDocument()
  })
})
