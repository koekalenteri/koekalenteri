import type { ManualTestResult, TestResult } from './types'
import { getRankingPeriod, NOME_A_CH_requirements, NOME_B_CH_requirements, NOWT_CH_requirements } from './rules_ch'

const officialResult = (result: TestResult): TestResult => result

const manualResult = (result: Omit<ManualTestResult, 'id' | 'official' | 'regNo'>): ManualTestResult => ({
  ...result,
  id: `${result.type}-${result.result}-${result.date.toISOString()}`,
  official: false,
  regNo: 'FI12345/67',
})

const nowtResult = (result: string, date: string, props: Partial<TestResult> = {}): TestResult =>
  officialResult({
    class: 'VOI',
    date: new Date(date),
    judge: `Judge ${result}`,
    location: `Loc ${result}`,
    result,
    type: 'NOWT',
    ...props,
  })

describe('championship ranking rules', () => {
  it('returns ranking periods for supported championship event types', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')
    const qualificationStartDate = new Date('2024-08-01T00:00:00.000Z')

    expect(getRankingPeriod('NOME-B SM', entryEndDate, qualificationStartDate)).toEqual({
      maxResultDate: expect.any(Date),
      minResultDate: qualificationStartDate,
    })
    expect(getRankingPeriod('NOME-A SM', entryEndDate, qualificationStartDate)).toEqual({
      maxResultDate: expect.any(Date),
      minResultDate: expect.any(Date),
    })
    expect(getRankingPeriod('NOWT SM', entryEndDate, qualificationStartDate)).toEqual({
      maxResultDate: expect.any(Date),
      minResultDate: expect.any(Date),
    })
    expect(getRankingPeriod('NOME-B SM', undefined, qualificationStartDate)).toBeUndefined()
  })

  it('aggregates official and manual NOME-B results, orders by points and limits to five', () => {
    const entryEndDate = new Date('2025-08-15T12:00:00.000Z')
    const qualificationStartDate = new Date('2024-08-01T00:00:00.000Z')

    const officialResults: TestResult[] = [
      officialResult({
        class: 'VOI',
        date: new Date('2025-05-05T00:00:00.000Z'),
        judge: 'Judge 1',
        location: 'Loc 1',
        result: 'VOI2',
        type: 'NOME-B',
      }),
      officialResult({
        class: 'VOI',
        date: new Date('2025-06-05T00:00:00.000Z'),
        judge: 'Judge 2',
        location: 'Loc 2',
        result: 'VOI1',
        type: 'NOME-B',
      }),
      officialResult({
        class: 'VOI',
        date: new Date('2025-04-05T00:00:00.000Z'),
        judge: 'Judge 3',
        location: 'Loc 3',
        result: 'VOI3',
        type: 'NOME-B',
      }),
    ]
    const manualResults: ManualTestResult[] = [
      manualResult({
        class: 'VOI',
        date: new Date('2025-07-05T00:00:00.000Z'),
        judge: 'Judge 4',
        location: 'Loc 4',
        result: 'FI KVA-B',
        type: 'NOME-B',
      }),
      manualResult({
        class: 'VOI',
        date: new Date('2025-03-05T00:00:00.000Z'),
        judge: 'Judge 5',
        location: 'Loc 5',
        result: 'VOI2',
        type: 'NOME-B',
      }),
      manualResult({
        class: 'VOI',
        date: new Date('2025-02-05T00:00:00.000Z'),
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
        date: new Date('2025-06-01T00:00:00.000Z'),
        judge: 'Judge A',
        location: 'Loc A',
        result: 'A1',
        type: 'NOME-A',
      }),
    ]
    const manualResults: ManualTestResult[] = [
      manualResult({
        class: 'VOI',
        date: new Date('2025-07-01T00:00:00.000Z'),
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
        date: new Date('2025-06-01T00:00:00.000Z'),
        judge: 'Judge A',
        location: 'Loc A',
        result: 'VOI1',
        type: 'NOWT',
      }),
    ]
    const manualResults: ManualTestResult[] = [
      manualResult({
        class: 'VOI',
        date: new Date('2025-07-01T00:00:00.000Z'),
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
          date: new Date('2025-07-01T00:00:00.000Z'),
          judge: 'Judge Ranking',
          location: 'Loc Ranking',
          result: 'VOI2',
          type: 'NOWT',
        }),
      ],
      [
        manualResult({
          class: 'VOI',
          date: new Date('2024-01-15T00:00:00.000Z'),
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

    const result = NOWT_CH_requirements(
      [nowtResult(resultName, '2025-06-01T00:00:00.000Z', props)],
      [],
      entryEndDate,
      undefined
    )

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
      [
        nowtResult('VOI1', '2024-01-15T00:00:00.000Z'),
        nowtResult('VOI2', '2024-01-16T00:00:00.000Z'),
        nowtResult('VOI3', '2024-01-17T00:00:00.000Z'),
      ],
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
        nowtResult('VOI1', '2025-06-01T00:00:00.000Z', { type: 'NOME-B' }),
        nowtResult('VOI1', '2025-06-02T00:00:00.000Z', { class: 'AVO' }),
        nowtResult('VOI0', '2025-06-03T00:00:00.000Z'),
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
        nowtResult('VOI3', '2025-01-01T00:00:00.000Z'),
        nowtResult('VOI2', '2025-02-01T00:00:00.000Z'),
        nowtResult('VOI1', '2025-03-01T00:00:00.000Z'),
        nowtResult('VOI1', '2025-04-01T00:00:00.000Z', { resCert: true }),
        nowtResult('VOI1', '2025-05-01T00:00:00.000Z', { cert: true }),
        nowtResult('FI KVA-WT', '2025-06-01T00:00:00.000Z'),
      ],
      [
        manualResult({
          class: 'VOI',
          date: new Date('2025-07-01T00:00:00.000Z'),
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
    expect(result.relevant.map((r) => r.date.toISOString())).toEqual([
      '2025-06-01T00:00:00.000Z',
      '2025-05-01T00:00:00.000Z',
      '2025-04-01T00:00:00.000Z',
      '2025-03-01T00:00:00.000Z',
      '2025-07-01T00:00:00.000Z',
    ])
    expect(result.relevant.map((r) => r.official)).toEqual([true, true, true, true, false])
  })
})
