import type { DayKey, JsonManualTestResult, JsonTestResult, ManualTestResult, TestResult } from './types'
import { filterRelevantResults, qualifyJsonRegistration } from './lib/qualification'
import { toDog, toManualTestResult } from './lib/wire'
import { getRankingPeriod, NOME_A_CH_requirements, NOME_B_CH_requirements, NOWT_CH_requirements } from './rules_ch'
import { beforeDayKeys, noonOfFinnishDay } from './test-utils/finnishDays'
import { describeInTimeZone, withTimeZone } from './test-utils/timeZone'

const officialResult = (result: TestResult): TestResult => result

const manualResult = (result: Omit<ManualTestResult, 'id' | 'official' | 'regNo'>): ManualTestResult => ({
  ...result,
  id: `${result.type}-${result.result}-${result.date}`,
  official: false,
  regNo: 'FI12345/67',
})

const nowtResult = (result: string, date: DayKey, props: Partial<TestResult> = {}): TestResult =>
  officialResult({
    class: 'VOI',
    date,
    judge: `Judge ${result}`,
    location: `Loc ${result}`,
    result,
    type: 'NOWT',
    ...props,
  })

describe('championship ranking rules', () => {
  // The period runs from the start of its first counted day to the end of its last, both in Finland: the
  // NOME-A and NOWT periods start the day after the entry's last day two years and a year back.
  it('returns ranking periods for supported championship event types', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')
    const qualificationStartDate = new Date('2024-08-01T00:00:00.000Z')
    const maxResultDate = new Date('2025-08-15T20:59:59.999Z')

    expect(getRankingPeriod('NOME-B SM', entryEndDate, qualificationStartDate)).toEqual({
      maxResultDate,
      minResultDate: new Date('2024-07-31T21:00:00.000Z'),
    })
    expect(getRankingPeriod('NOME-A SM', entryEndDate, qualificationStartDate)).toEqual({
      maxResultDate,
      minResultDate: new Date('2023-08-15T21:00:00.000Z'),
    })
    expect(getRankingPeriod('NOWT SM', entryEndDate, qualificationStartDate)).toEqual({
      maxResultDate,
      minResultDate: new Date('2024-08-15T21:00:00.000Z'),
    })
    expect(getRankingPeriod('NOME-B SM', undefined, qualificationStartDate)).toBeUndefined()
  })

  it('aggregates official and manual NOME-B results, orders by points and limits to five', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')
    const qualificationStartDate = new Date('2024-08-01T00:00:00.000Z')

    const officialResults: TestResult[] = [
      officialResult({
        class: 'VOI',
        date: '2025-05-05' as const,
        judge: 'Judge 1',
        location: 'Loc 1',
        result: 'VOI2',
        type: 'NOME-B',
      }),
      officialResult({
        class: 'VOI',
        date: '2025-06-05' as const,
        judge: 'Judge 2',
        location: 'Loc 2',
        result: 'VOI1',
        type: 'NOME-B',
      }),
      officialResult({
        class: 'VOI',
        date: '2025-04-05' as const,
        judge: 'Judge 3',
        location: 'Loc 3',
        result: 'VOI3',
        type: 'NOME-B',
      }),
    ]
    const manualResults: ManualTestResult[] = [
      manualResult({
        class: 'VOI',
        date: '2025-07-05' as const,
        judge: 'Judge 4',
        location: 'Loc 4',
        result: 'FI KVA-B',
        type: 'NOME-B',
      }),
      manualResult({
        class: 'VOI',
        date: '2025-03-05' as const,
        judge: 'Judge 5',
        location: 'Loc 5',
        result: 'VOI2',
        type: 'NOME-B',
      }),
      manualResult({
        class: 'VOI',
        date: '2025-02-05' as const,
        judge: 'Judge 6',
        location: 'Loc 6',
        result: 'VOI3',
        type: 'NOME-B',
      }),
    ]

    const result = NOME_B_CH_requirements(officialResults, manualResults, entryEndDate, qualificationStartDate)

    expect(result.qualifies).toBe(true)
    expect(result.relevant).toHaveLength(5)
    expect(result.relevant.map((r) => r.result)).toEqual(['FI KVA-B', 'VOI1', 'VOI2', 'VOI2', 'VOI3'])
    expect(result.relevant.map((r) => r.official)).toEqual([false, true, true, false, true])
  })

  it('keeps NOME-A qualification logic and ranking point ordering intact', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')

    const officialResults: TestResult[] = [
      officialResult({
        cacit: true,
        class: 'VOI',
        date: '2025-06-01' as const,
        judge: 'Judge A',
        location: 'Loc A',
        result: 'A1',
        type: 'NOME-A',
      }),
    ]
    const manualResults: ManualTestResult[] = [
      manualResult({
        class: 'VOI',
        date: '2025-07-01' as const,
        judge: 'Judge B',
        location: 'Loc B',
        resCacit: true,
        result: 'EXC',
        type: 'NOME-A KV',
      }),
    ]

    const result = NOME_A_CH_requirements(officialResults, manualResults, entryEndDate, undefined)

    expect(result.qualifies).toBe(true)
    expect(result.relevant.map((r) => r.rankingPoints)).toEqual([6, 5])
    expect(result.relevant.map((r) => r.official)).toEqual([true, false])
  })

  it('keeps NOWT qualification logic and ranking point ordering intact', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')

    const officialResults: TestResult[] = [
      officialResult({
        cert: true,
        class: 'VOI',
        date: '2025-06-01' as const,
        judge: 'Judge A',
        location: 'Loc A',
        result: 'VOI1',
        type: 'NOWT',
      }),
    ]
    const manualResults: ManualTestResult[] = [
      manualResult({
        class: 'VOI',
        date: '2025-07-01' as const,
        judge: 'Judge B',
        location: 'Loc B',
        result: 'VOI2',
        type: 'NOWT',
      }),
    ]

    const result = NOWT_CH_requirements(officialResults, manualResults, entryEndDate, undefined)

    expect(result.qualifies).toBe(true)
    expect(result.relevant.map((r) => r.rankingPoints)).toEqual([6, 2])
    expect(result.relevant.map((r) => r.official)).toEqual([true, false])
  })

  it('qualifies NOWT championship entry with FI KVA-WT achieved before the ranking period', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')

    const result = NOWT_CH_requirements(
      [
        officialResult({
          class: 'VOI',
          date: '2025-07-01' as const,
          judge: 'Judge Ranking',
          location: 'Loc Ranking',
          result: 'VOI2',
          type: 'NOWT',
        }),
      ],
      [
        manualResult({
          class: 'VOI',
          date: '2024-01-15' as const,
          judge: 'Judge KVA',
          location: 'Loc KVA',
          result: 'FI KVA-WT',
          type: 'NOWT',
        }),
      ],
      entryEndDate,
      undefined
    )

    expect(result.qualifies).toBe(true)
    expect(result.relevant).toHaveLength(2)
    expect(result.relevant.map((r) => r.result)).toEqual(['VOI2', 'FI KVA-WT'])
    expect(result.relevant.map((r) => r.rankingPoints)).toEqual([2, 0])
    expect(result.relevant[1]).toMatchObject({
      official: false,
      qualifying: true,
      rankingPoints: 0,
      result: 'FI KVA-WT',
    })
  })

  it.each([
    ['FI KVA-WT', {}, true, 6],
    ['VOI1', { cert: true }, true, 6],
    ['VOI1', { resCert: true }, true, 5],
    ['VOI1', {}, true, 4],
    ['VOI2', {}, false, 2],
    ['VOI3', {}, false, 1],
  ])('scores NOWT championship result %s with %p as %i points', (resultName, props, qualifies, rankingPoints) => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')

    const result = NOWT_CH_requirements([nowtResult(resultName, '2025-06-01', props)], [], entryEndDate, undefined)

    expect(result.qualifies).toBe(qualifies)
    expect(result.relevant).toHaveLength(1)
    expect(result.relevant[0]).toMatchObject({
      official: true,
      qualifying: true,
      rankingPoints,
      result: resultName,
    })
  })

  it('ignores non-champion NOWT results outside the ranking period', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')

    const result = NOWT_CH_requirements(
      [nowtResult('VOI1', '2024-01-15'), nowtResult('VOI2', '2024-01-16'), nowtResult('VOI3', '2024-01-17')],
      [],
      entryEndDate,
      undefined
    )

    expect(result.qualifies).toBe(false)
    expect(result.relevant).toEqual([])
  })

  it('ignores NOWT championship results from wrong type, class or result value', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')

    const result = NOWT_CH_requirements(
      [
        nowtResult('VOI1', '2025-06-01', { type: 'NOME-B' }),
        nowtResult('VOI1', '2025-06-02', { class: 'AVO' }),
        nowtResult('VOI0', '2025-06-03'),
      ],
      [],
      entryEndDate,
      undefined
    )

    expect(result.qualifies).toBe(false)
    expect(result.relevant).toEqual([])
  })

  it('orders NOWT ranking results by points and date and limits ranking results to five', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')

    const result = NOWT_CH_requirements(
      [
        nowtResult('VOI3', '2025-01-01'),
        nowtResult('VOI2', '2025-02-01'),
        nowtResult('VOI1', '2025-03-01'),
        nowtResult('VOI1', '2025-04-01', { resCert: true }),
        nowtResult('VOI1', '2025-05-01', { cert: true }),
        nowtResult('FI KVA-WT', '2025-06-01'),
      ],
      [
        manualResult({
          class: 'VOI',
          date: '2025-07-01' as const,
          judge: 'Judge Manual',
          location: 'Loc Manual',
          result: 'VOI2',
          type: 'NOWT',
        }),
      ],
      entryEndDate,
      undefined
    )

    expect(result.qualifies).toBe(true)
    expect(result.relevant).toHaveLength(5)
    expect(result.relevant.map((r) => r.result)).toEqual(['FI KVA-WT', 'VOI1', 'VOI1', 'VOI1', 'VOI2'])
    expect(result.relevant.map((r) => r.rankingPoints)).toEqual([6, 6, 5, 4, 2])
    expect(result.relevant.map((r) => r.date)).toEqual([
      '2025-06-01',
      '2025-05-01',
      '2025-04-01',
      '2025-03-01',
      '2025-07-01',
    ])
    expect(result.relevant.map((r) => r.official)).toEqual([true, true, true, true, false])
  })
})

/** Runs `run` in the host zone the lambdas have, UTC. */
const inLambdaZone = <T>(run: () => T): T => withTimeZone('UTC', run)

const REG_NO = 'FI12345/22'
const ENTRY_END = beforeDayKeys('2026-02-15T21:59:59.999Z') // the end of 15.2.2026 in Finland
const QUALIFICATION_START = beforeDayKeys('2025-01-31T22:00:00.000Z') // the start of 1.2.2025 in Finland
const START_DATE = beforeDayKeys('2026-03-07T22:00:00.000Z')

const smEvent = (eventType: string) => ({
  entryEndDate: ENTRY_END,
  eventType,
  qualificationStartDate: QUALIFICATION_START,
  startDate: START_DATE,
})

/** The decision the registration form makes in this browser, from the results as the API hands them over. */
const decideInBrowser = (eventType: string, official: JsonTestResult[], manual: JsonManualTestResult[] = []) =>
  filterRelevantResults(
    {
      entryEndDate: new Date(ENTRY_END),
      eventType,
      qualificationStartDate: new Date(QUALIFICATION_START),
      startDate: new Date(START_DATE),
    },
    undefined,
    toDog({ regNo: REG_NO, results: official }).results,
    manual.map((result) => toManualTestResult(result))
  )

/** The decision the lambda stores, from the same results. */
const decideOnLambda = (eventType: string, official: JsonTestResult[], manual: JsonManualTestResult[] = []) =>
  inLambdaZone(() =>
    qualifyJsonRegistration(
      { class: undefined, dog: { regNo: REG_NO, results: official }, results: manual },
      smEvent(eventType)
    )
  )

type ResultProps = Pick<JsonTestResult, 'date' | 'result' | 'type'>

const jsonResult = (props: ResultProps): JsonTestResult => ({ class: 'VOI', judge: 'Judge', location: 'Loc', ...props })

const jsonManualResult = (props: ResultProps): JsonManualTestResult => ({
  ...jsonResult(props),
  id: `manual-${props.date}`,
})

interface RankingPeriodCase {
  eventType: string
  result: string
  type: string
  before: DayKey
  first: DayKey
  last: DayKey
  after: DayKey
}

/**
 * The ranking periods that close with an entry ending 15.2.2026, in winter, when Istanbul is an hour ahead
 * of Finland: NOME-B from the qualification start,
 * NOME-A two years back and NOWT one year back, both from the day after the same day then.
 */
const PERIODS: RankingPeriodCase[] = [
  {
    after: '2026-02-16',
    before: '2025-01-31',
    eventType: 'NOME-B SM',
    first: '2025-02-01',
    last: '2026-02-15',
    result: 'VOI1',
    type: 'NOME-B',
  },
  {
    after: '2026-02-16',
    before: '2024-02-15',
    eventType: 'NOME-A SM',
    first: '2024-02-16',
    last: '2026-02-15',
    result: 'A1',
    type: 'NOME-A',
  },
  {
    after: '2026-02-16',
    before: '2025-02-15',
    eventType: 'NOWT SM',
    first: '2025-02-16',
    last: '2026-02-15',
    result: 'VOI1',
    type: 'NOWT',
  },
]

const EDGE_DAYS = PERIODS.flatMap((period) => [
  { ...period, counts: false, day: period.before, edge: 'the day before the first day' },
  { ...period, counts: true, day: period.first, edge: 'the first day' },
  { ...period, counts: true, day: period.last, edge: 'the last day' },
  { ...period, counts: false, day: period.after, edge: 'the day after the last day' },
])

const ALL_OFFICIAL = [true, true, true, true, true]

// Kennelliitto's result stamps have no zone, and the ranking period is made of Finnish days. A result counts
// by the day written on it, so the browser and the lambda keep the same results in any zone (KOE-1558).
describe('the ranking period in days', () => {
  for (const zone of ['UTC', 'Europe/Helsinki', 'America/New_York', 'Asia/Tokyo', 'Europe/Istanbul']) {
    describeInTimeZone(zone, () => {
      it.each(EDGE_DAYS)(
        '$eventType counts an official result on $edge ($day): $counts',
        ({ counts, day, eventType, result, type }) => {
          const official = [jsonResult({ date: beforeDayKeys(`${day}T00:00:00`), result, type })]

          expect(decideInBrowser(eventType, official).relevant).toHaveLength(counts ? 1 : 0)
          expect(decideOnLambda(eventType, official).qualifyingResults).toHaveLength(counts ? 1 : 0)
        }
      )

      // A hand-entered result is the instant the form sent, and it counts by its Finnish day. Picked at noon
      // in Finland, it is the same day in every zone here.
      it.each(EDGE_DAYS)(
        '$eventType counts a hand-entered result on $edge ($day): $counts',
        ({ counts, day, eventType, result, type }) => {
          const manual = [jsonManualResult({ date: beforeDayKeys(noonOfFinnishDay(day).toISOString()), result, type })]

          expect(decideInBrowser(eventType, [], manual).relevant).toHaveLength(counts ? 1 : 0)
          expect(decideOnLambda(eventType, [], manual).qualifyingResults).toHaveLength(counts ? 1 : 0)
        }
      )

      it.each([
        { day: '2025-02-15', points: 0 },
        { day: '2025-02-16', points: 6 },
      ])('scores a FI KVA-WT written on $day with $points points', ({ day, points }) => {
        const official = [jsonResult({ date: beforeDayKeys(`${day}T00:00:00`), result: 'FI KVA-WT', type: 'NOWT' })]
        const expected = [expect.objectContaining({ rankingPoints: points, result: 'FI KVA-WT' })]

        expect(decideInBrowser('NOWT SM', official).relevant).toEqual(expected)
        expect(decideOnLambda('NOWT SM', official).qualifyingResults).toEqual(expected)
      })

      // Equal points on the same Finnish day: an official result and a hand-entered one picked at midnight
      // in Finland. The sixth result drops out, and it is the same one in the browser and on the lambda:
      // a tie on points and day keeps the official result before the hand-entered one.
      it('cuts a tie on points and day the same way in the browser and on the lambda', () => {
        const official = ['2026-02-01', '2026-01-15', '2026-01-10', '2026-01-05', '2026-01-01'].map((day) =>
          jsonResult({ date: beforeDayKeys(`${day}T00:00:00`), result: 'VOI2', type: 'NOWT' })
        )
        const manual = [
          jsonManualResult({ date: beforeDayKeys('2025-12-31T22:00:00.000Z'), result: 'VOI2', type: 'NOWT' }),
        ]

        expect(decideInBrowser('NOWT SM', official, manual).relevant.map((r) => r.official)).toEqual(ALL_OFFICIAL)
        expect(decideOnLambda('NOWT SM', official, manual).qualifyingResults?.map((r) => r.official)).toEqual(
          ALL_OFFICIAL
        )
      })
    })
  }

  // Kennelliitto's empty date and an unreadable one are read as no day at the typed boundary.
  it('leaves a result with no day outside the period', () => {
    const result = NOWT_CH_requirements(
      [nowtResult('VOI1', '2025-06-01'), { ...nowtResult('VOI1', '2025-06-02'), date: undefined }],
      [
        {
          ...manualResult({
            class: 'VOI',
            date: '2025-06-03' as const,
            judge: 'J',
            location: 'L',
            result: 'VOI1',
            type: 'NOWT',
          }),
          date: undefined,
        },
      ],
      new Date(ENTRY_END),
      undefined
    )

    expect(result.relevant).toEqual([expect.objectContaining({ date: '2025-06-01' as const })])
  })

  // A FI KVA-B counts whenever it was won, so one without a day still ranks: after a dated result of equal points.
  it('ranks a FI KVA-B without a day after the dated results of equal points', () => {
    const nomeB = (result: string, date: DayKey | undefined): TestResult =>
      officialResult({ class: 'VOI', date, judge: 'J', location: 'L', result, type: 'NOME-B' })

    const result = NOME_B_CH_requirements(
      [nomeB('VOI1', '2025-06-01'), nomeB('FI KVA-B', undefined), nomeB('VOI1', '2025-07-01')],
      [],
      new Date(ENTRY_END),
      new Date(QUALIFICATION_START)
    )

    expect(result.relevant.map((r) => r.result)).toEqual(['VOI1', 'VOI1', 'FI KVA-B'])
    expect(result.relevant.map((r) => r.date)).toEqual(['2025-07-01', '2025-06-01', undefined])
  })

  it('leaves a stored official result of 1.1.0001 outside the period on the lambda', () => {
    const official = [jsonResult({ date: beforeDayKeys('0001-01-01T00:00:00'), result: 'VOI1', type: 'NOWT' })]

    expect(decideOnLambda('NOWT SM', official)).toEqual({ qualifies: false, qualifyingResults: [] })
  })
})
