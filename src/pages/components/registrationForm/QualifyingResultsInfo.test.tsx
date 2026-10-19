import type { ReactNode } from 'react'
import type { DayKey, ManualTestResult } from '@/types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen, within } from '@testing-library/react'
import {
  registrationWithManualResults,
  registrationWithStaticDates,
  registrationWithStaticDatesAndClass,
} from '@/__mockData__/registrations'
import { locales } from '@/i18n'
import { dayEnd, dayStart, TIME_ZONE } from '@/lib/day'
import { filterRelevantResults } from '@/lib/qualification'
import { toDog } from '@/lib/wire'
import { getRequirements } from '@/rules'
import { frozenInstant } from '@/test-utils/freezeClock'
import { describeInTimeZone } from '@/test-utils/timeZone'
import { renderWithUserEvents, runPendingTimers, typeDateKeyByKey } from '@/test-utils/utils'
import { beforeDayKeys } from '../../../test-utils/finnishDays'
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

    const daysOffered = async (dob: DayKey | undefined, rankingPeriod?: { min?: Date; max?: Date }) => {
      const reg = registrationWithManualResults
      const requirements = getRequirements(reg.eventType, reg.class, reg.dates[0].date)
      const result: ManualTestResult = { ...(reg.results ?? [])[0], date: '2026-05-10' as const }
      const { user } = renderWithUserEvents(
        <QualifyingResultsInfo
          dob={dob}
          rankingPeriod={rankingPeriod}
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
      expect(await daysOffered('2025-08-05')).toEqual(range(5, 15))
    })

    // Kennelliitto's empty date reaches the form as no birth day (KOE-1548).
    it('offers only today without a birth date', async () => {
      expect(await daysOffered(undefined)).toEqual([15])
    })

    // The period's last moment is 12.5. 23:59 in Finland, already 13.5. in Tokyo: the picker offered
    // the day after the period there (KOE-1548).
    describe.each([TIME_ZONE, 'America/New_York', 'Asia/Tokyo'])('in %s', (zone) => {
      describeInTimeZone(zone, () => {
        it('offers no day after the ranking period ends (KOE-1548)', async () => {
          const rankingPeriod = { max: dayEnd('2026-05-12', TIME_ZONE), min: dayStart('2025-05-13', TIME_ZONE) }

          expect(await daysOffered('2025-08-05', rankingPeriod)).toEqual(range(5, 12))
        })

        it('offers no day after today in a ranking period that ends later (KOE-1548)', async () => {
          const rankingPeriod = { max: dayEnd('2026-06-30', TIME_ZONE), min: dayStart('2025-07-01', TIME_ZONE) }

          expect(await daysOffered('2025-08-05', rankingPeriod)).toEqual(range(5, 15))
        })
      })
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
      date: DayKey,
      rankingPoints: number,
      cert?: boolean
    ): ManualTestResult => ({
      cert,
      class: 'VOI',
      date,
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

  // Kennelliitto's result day as the API hands it over: a bare day, which `new Date` reads as UTC
  // midnight, the day before west of UTC (KOE-1548).
  describe.each([TIME_ZONE, 'America/New_York', 'Asia/Tokyo'])('an official result in %s', (zone) => {
    describeInTimeZone(zone, () => {
      it.each(['2024-01-01', '2024-01-01T00:00:00'])('shows the day written on it, %s, as 01.01.2024', (aika) => {
        const reg = registrationWithStaticDatesAndClass
        const [official] = toDog({
          regNo: reg.dog.regNo,
          results: [
            { class: 'ALO', date: beforeDayKeys(aika), judge: 'J', location: 'L', result: 'ALO1', type: 'NOME-B' },
          ],
        }).results
        render(
          <QualifyingResultsInfo
            regNo={reg.dog.regNo}
            requirements={getRequirements(reg.eventType, reg.class, reg.dates[0].date)}
            qualifyingResults={[{ ...official, official: true, qualifying: true }]}
          />,
          { wrapper: Provider }
        )

        expect(screen.getByRole('group', { name: 'testResult.date' })).toHaveTextContent('01.01.2024')
      })
    })
  })

  // A hand-entered result typed key by key, as a person types: the year passes through 2, 20 and 202,
  // which are whole dates but no days, and the field keeps what is typed (KOE-1481, KOE-1548).
  describe.each([TIME_ZONE, 'America/New_York', 'Asia/Tokyo'])('a hand-entered date in %s', (zone) => {
    describeInTimeZone(zone, () => {
      beforeEach(() =>
        vi.useFakeTimers({ now: frozenInstant('2026-05-15'), toFake: ['Date', 'setTimeout', 'clearTimeout'] })
      )
      afterEach(() => vi.useRealTimers())

      it('keeps the typed day and stores it as the key', async () => {
        const reg = registrationWithManualResults
        const onChange = vi.fn()
        const result: ManualTestResult = { ...(reg.results ?? [])[0], date: undefined }
        const { user } = renderWithUserEvents(
          <QualifyingResultsInfo
            dob="2020-01-01"
            regNo={reg.dog.regNo}
            requirements={getRequirements(reg.eventType, reg.class, reg.dates[0].date)}
            results={[result]}
            qualifyingResults={[]}
            onChange={onChange}
          />,
          { wrapper: Provider },
          { advanceTimers: vi.advanceTimersByTime }
        )
        const group = screen.getByRole('group', { name: 'testResult.date' })
        await typeDateKeyByKey(user, group, '10052026')
        await runPendingTimers()

        expect(group).toHaveTextContent('10.05.2026')
        expect(onChange).toHaveBeenLastCalledWith({
          results: [expect.objectContaining({ date: '2026-05-10' as const })],
        })
      })
    })
  })
})
