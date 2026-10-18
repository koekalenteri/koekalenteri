import type { ReactNode } from 'react'
import type { ManualTestResult } from '@/types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen, within } from '@testing-library/react'
import {
  registrationWithManualResults,
  registrationWithStaticDates,
  registrationWithStaticDatesAndClass,
} from '@/__mockData__/registrations'
import { locales } from '@/i18n'
import { filterRelevantResults } from '@/lib/qualification'
import { getRequirements } from '@/rules'
import { noonOfFinnishDay } from '@/test-utils/finnishDays'
import { frozenInstant } from '@/test-utils/freezeClock'
import { renderWithUserEvents } from '@/test-utils/utils'
import QualifyingResultsInfo from './QualifyingResultsInfo'

const Provider = ({ children }: { readonly children: ReactNode }) => (
  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
    {children}
  </LocalizationProvider>
)

describe('QualifyingResultsInfo', () => {
  it('should render with minimal input', () => {
    render(<QualifyingResultsInfo />, { wrapper: Provider })

    expect(screen.getByText('registration.qualifyingResults')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'registration.cta.addResult' })).toBeDisabled()
  })

  it('should render a NOME-B ALO registraton', () => {
    const reg = registrationWithStaticDatesAndClass
    const requirements = getRequirements(reg.eventType, reg.class, reg.dates?.length ? reg.dates[0].date : new Date())
    render(
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
      />,
      { wrapper: Provider }
    )

    expect(registrationWithStaticDatesAndClass.eventType).toEqual('NOME-B')
    expect(registrationWithStaticDatesAndClass.class).toEqual('ALO')
    expect(screen.getByDisplayValue('test judge')).toBeInTheDocument()
    expect(screen.getByDisplayValue('test location')).toBeInTheDocument()
  })

  it('should render a NOME-B AVO registraton with manual results', () => {
    const reg = registrationWithManualResults
    const requirements = getRequirements(reg.eventType, reg.class, reg.dates?.length ? reg.dates[0].date : new Date())
    render(
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
      />,
      { wrapper: Provider }
    )

    expect(registrationWithManualResults.eventType).toEqual('NOME-B')
    expect(registrationWithManualResults.class).toEqual('AVO')
    expect(screen.getByDisplayValue('Manual Judge')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Manual Judge 2')).toBeInTheDocument()
  })

  describe("the result date picker's days (KOE-1556)", () => {
    // Today is 15.5.2026, the last day a result can have; the result's picker opens on May.
    beforeEach(() => vi.useFakeTimers({ now: frozenInstant('2026-05-15'), toFake: ['Date'] }))
    afterEach(() => vi.useRealTimers())

    const daysOffered = async (dob: Date | undefined) => {
      const reg = registrationWithManualResults
      const requirements = getRequirements(reg.eventType, reg.class, reg.dates[0].date)
      const result = { ...(reg.results ?? [])[0], date: noonOfFinnishDay('2026-05-10') }
      const { user } = renderWithUserEvents(
        <QualifyingResultsInfo
          dob={dob}
          regNo={reg.dog.regNo}
          requirements={requirements}
          results={[result]}
          qualifyingResults={[]}
        />,
        { wrapper: Provider }
      )
      await user.click(screen.getByRole('button', { name: /choose date/i }))
      const dialog = await screen.findByRole('dialog')
      // The cells before the first of the month are empty fillers.
      return within(dialog)
        .getAllByRole('gridcell')
        .filter((cell) => cell.textContent !== '' && !cell.hasAttribute('disabled'))
        .map((cell) => Number(cell.textContent))
    }

    const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => first + i)

    it('offers the days from nine months after birth to today', async () => {
      expect(await daysOffered(new Date('2025-08-05T00:00:00'))).toEqual(range(5, 15))
    })

    it.each([
      ["Kennelliitto's empty date", () => new Date('0001-01-01T00:00:00')],
      ['a half-typed date', () => new Date(Number.NaN)],
      ['a typed year 202', () => new Date('0202-12-28T00:00:00')],
    ])('sets no lower bound for a birth date with no day, %s', async (_name, dob) => {
      expect(await daysOffered(dob())).toEqual(range(1, 15))
    })

    it('offers only today without a birth date', async () => {
      expect(await daysOffered(undefined)).toEqual([15])
    })
  })

  it('should not allow entering results for NOU test', async () => {
    const reg = registrationWithStaticDates
    const requirements = getRequirements(reg.eventType, reg.class, reg.dates?.length ? reg.dates[0].date : new Date())
    render(
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
      />,
      { wrapper: Provider }
    )

    const button = screen.getByRole('button', { name: 'registration.cta.addResult' })
    expect(button).toBeDisabled()
  })

  it('should allow entering results for NOME-B rest', async () => {
    const reg = registrationWithStaticDatesAndClass
    const requirements = getRequirements(reg.eventType, reg.class, reg.dates?.length ? reg.dates[0].date : new Date())
    render(
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
      />,
      { wrapper: Provider }
    )

    const button = screen.getByRole('button', { name: 'registration.cta.addResult' })
    expect(button).toBeEnabled()
  })

  it('should only count the five best results towards the total ranking points', () => {
    const event = {
      entryEndDate: new Date('2024-06-01'),
      eventType: 'NOWT SM',
      startDate: new Date('2024-08-01'),
    }
    const regNo = 'FI12345/20'
    // rankingPoints is what an earlier save persisted on the manual result, so a result that has
    // since dropped out of the best five still carries points of its own.
    const manualResult = (
      id: string,
      result: string,
      date: string,
      rankingPoints: number,
      cert?: boolean
    ): ManualTestResult => ({
      cert,
      class: 'VOI',
      date: new Date(date),
      id,
      judge: 'Tuomari',
      location: 'Paikka',
      official: false,
      qualifying: true,
      rankingPoints,
      regNo,
      result,
      type: 'NOWT',
    })

    // Six manually entered results, worth 6 + 6 + 6 + 4 + 4 + 2 points. Only the five best count.
    const results = [
      manualResult('1', 'VOI1', '2024-05-01', 6, true),
      manualResult('2', 'VOI1', '2024-04-01', 6, true),
      manualResult('3', 'VOI1', '2024-03-01', 6, true),
      manualResult('4', 'VOI1', '2024-02-01', 4),
      manualResult('5', 'VOI1', '2024-01-01', 4),
      manualResult('6', 'VOI2', '2023-12-01', 2),
    ]
    const filtered = filterRelevantResults(event, undefined, [], results)
    expect(filtered.relevant).toHaveLength(5)

    render(
      <QualifyingResultsInfo
        eventType={event.eventType}
        regNo={regNo}
        requirements={getRequirements(event.eventType, undefined, event.startDate)}
        results={results}
        qualifyingResults={filtered.relevant}
      />,
      { wrapper: Provider }
    )

    expect(screen.getByText('26')).toBeInTheDocument()
    expect(screen.queryByText('28')).toBeNull()
  })
})
