import { t } from 'i18next'
import { judgeName } from './judge'

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
})
