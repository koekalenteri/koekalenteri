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
      expect(judgeName({ name: 'Testi Tuomari', foreing: true, country: 'IT' }, t)).toEqual('Testi Tuomari (Italia)')
    })

    it('should return name when no country for foreing judge', () => {
      expect(judgeName({ name: 'Testi Tuomari', foreing: true }, t)).toEqual('Testi Tuomari')
    })
  })
})
