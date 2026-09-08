import type { PublicJudge } from '../types'
import { t } from 'i18next'
import { canJudgeMockTrial, judgeName, judgesMockTrialIndependently, makeArray } from './judge'

describe('lib/judge', () => {
  describe('judgeName', () => {
    it('should return emptry string for undefined', () => {
      expect(judgeName(undefined, t)).toEqual('')
    })

    it('should return name for domestic judge', () => {
      expect(judgeName({ name: 'Test Judge' }, t)).toEqual('Test Judge')
    })

    it('should return name and country for foreing judge', () => {
      expect(judgeName({ country: 'IT', foreing: true, name: 'Testi Tuomari' }, t)).toEqual('Testi Tuomari (Italia)')
    })

    it('should return name when no country for foreing judge', () => {
      expect(judgeName({ foreing: true, name: 'Testi Tuomari' }, t)).toEqual('Testi Tuomari')
    })
  })

  describe('canJudgeMockTrial (KOE-308)', () => {
    it.each([['NOME-A'], ['NOWT'], ['NOME-B', 'NOWT']])('lets a judge of %j judge a Mock trial', (...eventTypes) => {
      expect(canJudgeMockTrial({ eventTypes })).toEqual(true)
    })

    it.each([[], ['NOME-B'], ['NOU', 'NKM']])('keeps a judge of %j out of a Mock trial', (...eventTypes) => {
      expect(canJudgeMockTrial({ eventTypes })).toEqual(false)
    })
  })

  describe('judgesMockTrialIndependently (KOE-1357)', () => {
    it('is the right of every A-trial judge, flag or no flag', () => {
      expect(judgesMockTrialIndependently({ eventTypes: ['NOME-A'] })).toEqual(true)
      expect(judgesMockTrialIndependently({ eventTypes: ['NOME-A'], mockTrial: false })).toEqual(true)
    })

    it('is a NOWT judge’s only when named for it', () => {
      expect(judgesMockTrialIndependently({ eventTypes: ['NOWT'], mockTrial: true })).toEqual(true)
      expect(judgesMockTrialIndependently({ eventTypes: ['NOWT'] })).toEqual(false)
      expect(judgesMockTrialIndependently({ eventTypes: ['NOWT'], mockTrial: false })).toEqual(false)
    })

    it('does not follow the flag onto a judge of another format', () => {
      expect(judgesMockTrialIndependently({ eventTypes: ['NOME-B'], mockTrial: true })).toEqual(false)
    })
  })
})

describe('makeArray', () => {
  const judge1: PublicJudge = { id: 1, name: 'Judge One', official: true }
  const judge2: PublicJudge = { id: 2, name: 'Judge Two', official: true }

  it('converts a single judge to an array', () => {
    expect(makeArray(judge1)).toEqual([judge1])
  })

  it('returns a copy of an array', () => {
    const arr = [judge1, judge2]
    const result = makeArray(arr)
    expect(result).toEqual(arr)
    expect(result).not.toBe(arr)
  })

  it('returns an empty array for undefined', () => {
    expect(makeArray(undefined)).toEqual([])
  })
})
