import type { DayKey, ManualTestResult, QualifyingResult } from '@/types'
import { TIME_ZONE } from '@/lib/day'
import { getRequirements } from '@/rules'
import { NOME_B_CH_requirements } from '@/rules_ch'
import { frozenInstant } from '@/test-utils/freezeClock'
import { describeInTimeZone } from '@/test-utils/timeZone'
import { availableResults, availableTypes, createMissingResult, getResultId, resultBorderColor } from './utils'

const ID_REGEXP = /^[0-9a-zA-Z_-]{10}$/
// SM rules are in force from 15.4.2023 onwards
const SM_RULE_DATE: DayKey = '2024-01-01'

describe('QualifyingResultsInfo utils', () => {
  describe('availableTypes', () => {
    it('should return empty array with undefined input', () => {
      expect(availableTypes()).toEqual([])
    })

    it('should return unique types from given requirements', () => {
      expect(
        availableTypes({
          date: '1977-01-01',
          rules: [
            { count: 1, result: 'ALO1', type: 'NOME-B' },
            { count: 1, result: 'ALO2', type: 'NOME-B' },
          ],
        })
      ).toEqual(['NOME-B'])

      expect(
        availableTypes({
          date: '1977-01-01',
          rules: [
            { count: 1, result: 'ALO1', type: 'NOME-B' },
            { count: 1, result: 'ALO1', type: 'NOWT' },
          ],
        })
      ).toEqual(['NOME-B', 'NOWT'])
    })

    it('should handle array rules', () => {
      expect(
        availableTypes({
          date: '1977-01-01',
          rules: [
            [
              { count: 1, result: 'ALO1', type: 'NOME-B' },
              { count: 1, result: 'ALO1', type: 'NOWT' },
            ],
          ],
        })
      ).toEqual(['NOME-B', 'NOWT'])
    })

    // SM events have no listed rules: their requirements are a function, so the types come from
    // the event type alone.
    it.each([
      ['NOME-B SM', ['NOME-B']],
      ['NOME-A SM', ['NOME-A', 'NOME-A KV']],
      ['NOWT SM', ['NOWT']],
    ])('should return the types accepted by %s', (eventType, expected) => {
      expect(availableTypes(getRequirements(eventType, undefined, SM_RULE_DATE), eventType)).toEqual(expected)
    })
  })

  describe('availableResults', () => {
    it('should return empty array with undefined input', () => {
      expect(availableResults()).toEqual([])
    })

    it('should return unique results from given requirements', () => {
      expect(
        availableResults({
          date: '1977-01-01',
          rules: [
            { count: 1, result: 'ALO1', type: 'NOME-B' },
            { count: 1, result: 'ALO2', type: 'NOME-B' },
          ],
        })
      ).toEqual(['ALO1', 'ALO2'])

      expect(
        availableResults({
          date: '1977-01-01',
          rules: [
            { count: 1, result: 'ALO1', type: 'NOME-B' },
            { count: 1, result: 'ALO1', type: 'NOWT' },
          ],
        })
      ).toEqual(['ALO1'])
    })

    it('should handle array rules', () => {
      expect(
        availableResults({
          date: '1977-01-01',
          rules: [
            [
              { count: 1, result: 'ALO1', type: 'NOME-B' },
              { count: 1, result: 'ALO1', type: 'NOWT' },
            ],
          ],
        })
      ).toEqual(['ALO1'])

      expect(
        availableResults({
          date: '1977-01-01',
          rules: [
            [
              { count: 1, result: 'ALO1', type: 'NOME-B' },
              { count: 1, result: 'ALO2', type: 'NOWT' },
            ],
          ],
        })
      ).toEqual(['ALO1', 'ALO2'])
    })

    it.each([
      ['NOME-B SM', 'NOME-B', ['FI KVA-B', 'VOI1', 'VOI2', 'VOI3']],
      ['NOWT SM', 'NOWT', ['FI KVA-WT', 'VOI1', 'VOI2', 'VOI3']],
      ['NOME-A SM', 'NOME-A', ['FI KVA-FT', 'A1 CERT', 'A1 RES-CERT', 'A1', 'A2', 'A3']],
      ['NOME-A SM', 'NOME-A KV', ['EXC CACIT', 'EXC RES-CACIT', 'EXC', 'VG', 'G']],
    ])('should return the results accepted by %s for type %s', (eventType, type, expected) => {
      expect(availableResults(getRequirements(eventType, undefined, SM_RULE_DATE), type, eventType)).toEqual(expected)
    })

    it('should not offer a title the dog already has', () => {
      const kvaResult: ManualTestResult = {
        class: 'VOI',
        date: '2024-01-01',
        id: 'kva',
        judge: 'Judge Dredd',
        location: 'Location',
        official: false,
        regNo: 'test-reg-no',
        result: 'FI KVA-WT',
        type: 'NOWT',
      }

      expect(
        availableResults(getRequirements('NOWT SM', undefined, SM_RULE_DATE), 'NOWT', 'NOWT SM', [kvaResult])
      ).toEqual(['VOI1', 'VOI2', 'VOI3'])
    })
  })

  describe('createMissingResult', () => {
    it('should create a result based on first missing rule', () => {
      expect(
        createMissingResult(
          {
            date: '1977-01-01',
            rules: [
              [
                { count: 1, result: 'ALO1', type: 'NOME-B' },
                { count: 1, result: 'ALO2', type: 'NOWT' },
              ],
            ],
          },
          [],
          'test-reg-no'
        )
      ).toEqual(
        expect.objectContaining({
          class: '',
          id: expect.stringMatching(ID_REGEXP),
          official: false,
          qualifying: true,
          regNo: 'test-reg-no',
          result: 'ALO1',
          type: 'NOME-B',
        })
      )

      expect(
        createMissingResult(
          {
            date: '1977-01-01',
            rules: [
              [
                { count: 1, result: 'ALO1', type: 'NOME-B' },
                { class: 'AVO', count: 1, result: 'AVO2', type: 'NOWT' },
              ],
            ],
          },
          [
            {
              class: 'ALO',
              date: '2024-01-01',
              id: 'test',
              judge: 'Judge Dredd',
              location: 'Location',
              official: true,
              regNo: 'test-reg-no',
              result: 'ALO1',
              type: 'NOME-B',
            },
          ],
          'test-reg-no'
        )
      ).toEqual(
        expect.objectContaining({
          class: 'AVO',
          id: expect.stringMatching(ID_REGEXP),
          official: false,
          qualifying: true,
          regNo: 'test-reg-no',
          result: 'AVO2',
          type: 'NOWT',
        })
      )
    })

    it('should create an empty result when all rules are fullfilled', () => {
      expect(
        createMissingResult(
          {
            date: '1977-01-01',
            rules: [[{ count: 1, result: 'ALO1', type: 'NOME-B' }]],
          },
          [
            {
              class: 'ALO',
              date: '2024-01-01',
              id: 'test',
              judge: 'Judge Dredd',
              location: 'Location',
              official: true,
              regNo: 'test-reg-no',
              result: 'ALO1',
              type: 'NOME-B',
            },
          ],
          'test-reg-no'
        )
      ).toEqual(
        expect.objectContaining({
          class: '',
          id: expect.stringMatching(ID_REGEXP),
          official: false,
          qualifying: true,
          regNo: 'test-reg-no',
          result: '',
          type: '',
        })
      )

      expect(createMissingResult(undefined, [], 'test-reg-no')).toEqual(
        expect.objectContaining({
          class: '',
          id: expect.stringMatching(ID_REGEXP),
          official: false,
          qualifying: true,
          regNo: 'test-reg-no',
          result: '',
          type: '',
        })
      )
    })
  })

  // The new row's date is the last day its picker offers: the ranking period's last Finnish day, or
  // today in Finland, as a day key (KOE-1548).
  describe.each([TIME_ZONE, 'America/New_York', 'Asia/Tokyo'])('the default date in %s', (zone) => {
    describeInTimeZone(zone, () => {
      beforeEach(() => vi.useFakeTimers({ now: frozenInstant('2026-05-15'), toFake: ['Date'] }))
      afterEach(() => vi.useRealTimers())

      it.each([
        { expected: '2026-05-12', periodEnd: '2026-05-12' },
        { expected: '2026-05-15', periodEnd: '2026-06-30' },
        { expected: '2026-05-15', periodEnd: undefined },
      ] as const)('is $expected for a period ending on $periodEnd (KOE-1548)', ({ expected, periodEnd }) => {
        expect(createMissingResult(undefined, [], 'test-reg-no', periodEnd).date).toBe(expected)
      })

      // A NOME-B SM ranking period of one day, 12.5.2026: the new row's default, filled in as a VOI1,
      // must count in it. As a local midnight it was 11.5. in Finland in Tokyo, outside the period.
      it('counts a new result on its default day in the ranking period (KOE-1548)', () => {
        const entryEndDate: DayKey = '2026-05-12'
        const qualificationStartDate: DayKey = '2026-05-12'
        const manual: ManualTestResult = {
          ...createMissingResult(undefined, [], 'test-reg-no', entryEndDate),
          class: 'VOI',
          judge: 'J',
          location: 'L',
          result: 'VOI1',
          type: 'NOME-B',
        }

        expect(NOME_B_CH_requirements([], [manual], entryEndDate, qualificationStartDate).qualifies).toBe(true)
      })
    })
  })

  describe('getResultId', () => {
    const official = (props: Partial<QualifyingResult>): QualifyingResult => ({
      class: 'VOI',
      date: '2024-01-01',
      judge: 'J',
      location: 'L',
      official: true,
      result: 'VOI1',
      type: 'NOWT',
      ...props,
    })

    it('keeps the id of a hand-entered result', () => {
      expect(getResultId({ ...official({}), id: 'own-id', official: false, regNo: 'R' })).toBe('own-id')
    })

    // Each field the id is made of tells two official results apart.
    it.each([
      { field: 'type', other: { type: 'NOME-B' } },
      { field: 'class', other: { class: 'AVO' } },
      { field: 'date', other: { date: '2024-02-01' } },
      { field: 'result', other: { result: 'VOI2' } },
      { field: 'location', other: { location: 'Elsewhere' } },
      { field: 'judge', other: { judge: 'K' } },
    ] as const)('tells apart official results that differ only by $field', ({ other }) => {
      expect(getResultId(official({}))).not.toBe(getResultId(official(other)))
    })

    // Kennelliitto's empty date is read as no day (KOE-1548): two such results must not share an id.
    it('tells apart two undated official results of one type and class', () => {
      const first = official({ date: undefined })
      const second = official({ date: undefined, location: 'Elsewhere' })

      expect(getResultId(first)).not.toBe(getResultId(second))
    })
  })

  describe('resultBorderColor', () => {
    it('should return "success.light" for qualifying result', () => {
      expect(resultBorderColor(true)).toEqual('success.light')
    })

    it('should return "error.main" for not-qualifying result', () => {
      expect(resultBorderColor(false)).toEqual('error.main')
    })

    it('should return undefined for undefined result', () => {
      expect(resultBorderColor(undefined)).toBeUndefined()
    })
  })
})
