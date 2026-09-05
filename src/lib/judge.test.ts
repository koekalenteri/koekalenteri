import { t } from 'i18next'
import { canJudgeMockTrial, judgeName, judgesMockTrialIndependently } from './judge'

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
