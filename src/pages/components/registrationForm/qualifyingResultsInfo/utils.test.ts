import type { ManualTestResult } from '../../../../types'
import { getRequirements } from '../../../../rules'
import { availableResults, availableTypes, createMissingResult, resultBorderColor } from './utils'

const ID_REGEXP = /^[0-9a-zA-Z_-]{10}$/
// SM rules are in force from 15.4.2023 onwards
const SM_RULE_DATE = new Date('2024-01-01')

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
        date: new Date('2024-01-01'),
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
              date: new Date(),
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
              date: new Date(),
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
