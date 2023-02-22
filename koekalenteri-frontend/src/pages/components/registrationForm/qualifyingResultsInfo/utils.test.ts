import { availableResults, availableTypes, createMissingResult, resultBorderColor } from './utils'

const UUID_REGEXP = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/

describe('QualifyingResultsInfo utils', () => {
  describe('availableTypes', () => {
    it('should return empty array with undefined input', () => {
      expect(availableTypes()).toEqual([])
    })

    it('should return unique types from given requirements', () => {
      expect(availableTypes({
        date: '1977-01-01',
        rules: [
          { type: 'NOME-B', result: 'ALO1', count: 1 },
          { type: 'NOME-B', result: 'ALO2', count: 1 },
        ],
      })).toEqual(['NOME-B'])

      expect(availableTypes({
        date: '1977-01-01',
        rules: [
          { type: 'NOME-B', result: 'ALO1', count: 1 },
          { type: 'NOWT', result: 'ALO1', count: 1 },
        ],
      })).toEqual(['NOME-B', 'NOWT'])
    })

    it('should handle array rules', () => {
      expect(availableTypes({
        date: '1977-01-01',
        rules: [[
          { type: 'NOME-B', result: 'ALO1', count: 1 },
          { type: 'NOWT', result: 'ALO1', count: 1 },
        ]],
      })).toEqual(['NOME-B', 'NOWT'])
    })
  })

  describe('availableResults', () => {
    it('should return empty array with undefined input', () => {
      expect(availableResults()).toEqual([])
    })

    it('should return unique results from given requirements', () => {
      expect(availableResults({
        date: '1977-01-01',
        rules: [
          { type: 'NOME-B', result: 'ALO1', count: 1 },
          { type: 'NOME-B', result: 'ALO2', count: 1 },
        ],
      })).toEqual(['ALO1', 'ALO2'])

      expect(availableResults({
        date: '1977-01-01',
        rules: [
          { type: 'NOME-B', result: 'ALO1', count: 1 },
          { type: 'NOWT', result: 'ALO1', count: 1 },
        ],
      })).toEqual(['ALO1'])
    })

    it('should handle array rules', () => {
      expect(availableResults({
        date: '1977-01-01',
        rules: [[
          { type: 'NOME-B', result: 'ALO1', count: 1 },
          { type: 'NOWT', result: 'ALO1', count: 1 },
        ]],
      })).toEqual(['ALO1'])

      expect(availableResults({
        date: '1977-01-01',
        rules: [[
          { type: 'NOME-B', result: 'ALO1', count: 1 },
          { type: 'NOWT', result: 'ALO2', count: 1 },
        ]],
      })).toEqual(['ALO1', 'ALO2'])
    })
  })

  describe('createMissingResult', () => {
    it('should create a result based on first missing rule', () => {
      expect(createMissingResult(
        {
          date: '1977-01-01',
          rules: [[
            { type: 'NOME-B', result: 'ALO1', count: 1 },
            { type: 'NOWT', result: 'ALO2', count: 1 },
          ]],
        },
        [],
        'test-reg-no',
      )).toEqual(expect.objectContaining({
        id: expect.stringMatching(UUID_REGEXP),
        regNo: 'test-reg-no',
        official: false,
        qualifying: true,
        type: 'NOME-B',
        result: 'ALO1',
        class: '',
      }))

      expect(createMissingResult(
        {
          date: '1977-01-01',
          rules: [[
            { type: 'NOME-B', result: 'ALO1', count: 1 },
            { type: 'NOWT', result: 'AVO2', class: 'AVO', count: 1 },
          ]],
        },
        [{ id: 'test', regNo: 'test-reg-no', official: true, type: 'NOME-B', result: 'ALO1', date: new Date(), class: 'ALO', judge: 'Judge Dredd', location: 'Location' }],
        'test-reg-no',
      )).toEqual(expect.objectContaining({
        id: expect.stringMatching(UUID_REGEXP),
        regNo: 'test-reg-no',
        official: false,
        qualifying: true,
        type: 'NOWT',
        result: 'AVO2',
        class: 'AVO',
      }))
    })

    it('should create an empty result when all rules are fullfilled', () => {
      expect(createMissingResult(
        {
          date: '1977-01-01',
          rules: [[
            { type: 'NOME-B', result: 'ALO1', count: 1 },
          ]],
        },
        [{ id: 'test', regNo: 'test-reg-no', official: true, type: 'NOME-B', result: 'ALO1', date: new Date(), class: 'ALO', judge: 'Judge Dredd', location: 'Location' }],
        'test-reg-no',
      )).toEqual(expect.objectContaining({
        id: expect.stringMatching(UUID_REGEXP),
        regNo: 'test-reg-no',
        official: false,
        qualifying: true,
        type: '',
        result: '',
        class: '',
      }))

      expect(createMissingResult(
        undefined,
        [],
        'test-reg-no',
      )).toEqual(expect.objectContaining({
        id: expect.stringMatching(UUID_REGEXP),
        regNo: 'test-reg-no',
        official: false,
        qualifying: true,
        type: '',
        result: '',
        class: '',
      }))
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
