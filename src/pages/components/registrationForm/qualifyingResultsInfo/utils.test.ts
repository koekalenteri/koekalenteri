import { availableResults, availableTypes, createMissingResult, resultBorderColor } from './utils'

const ID_REGEXP = /^[0-9a-zA-Z_-]{10}$/

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
      expect(resultBorderColor(undefined)).toEqual(undefined)
    })
  })
})
