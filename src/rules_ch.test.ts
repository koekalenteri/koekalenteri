import type { ManualTestResult, TestResult } from './types'
import { getRankingPeriod, NOME_A_CH_requirements, NOME_B_CH_requirements, NOWT_CH_requirements } from './rules_ch'

const officialResult = (result: TestResult): TestResult => result

const manualResult = (result: Omit<ManualTestResult, 'id' | 'official' | 'regNo'>): ManualTestResult => ({
  ...result,
  id: `${result.type}-${result.result}-${result.date.toISOString()}`,
  official: false,
  regNo: 'FI12345/67',
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
})
