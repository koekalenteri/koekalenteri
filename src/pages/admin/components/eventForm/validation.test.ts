import { emptyEvent } from '../../../../__mockData__/emptyEvent'

import { VALIDATORS } from './validation'

describe('validation', () => {
  describe('VALIDATORS', () => {
    describe('headquarters', () => {
      it.each`
        headquarters              | required | expected
        ${{ zipCode: undefined }} | ${false} | ${false}
        ${{ zipCode: '' }}        | ${false} | ${false}
        ${{ zipCode: '' }}        | ${false} | ${false}
        ${{ zipCode: '33101' }}   | ${false} | ${false}
        ${{ zipCode: '33101' }}   | ${true}  | ${false}
        ${{ zipCode: '' }}        | ${true}  | ${false}
        ${{ zipCode: 'abba' }}    | ${false} | ${'zipCode'}
        ${{ zipCode: '1234' }}    | ${true}  | ${'zipCode'}
        ${{ zipCode: '123456' }}  | ${true}  | ${'zipCode'}
      `('when headquarters is %p, required is %p, it should return %p', ({ headquarters, required, expected }) => {
        expect(VALIDATORS.headquarters?.({ ...emptyEvent, headquarters }, required)).toEqual(expected)
      })
    })
  })

  describe('costMember', () => {
    it('should return false when costMember is less than or equal to cost', () => {
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost: 10, costMember: 10 }, true)).toBe(false)
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost: 10, costMember: 5 }, true)).toBe(false)
    })

    it('should return costMemberHigh when costMember is greater than cost', () => {
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost: 10, costMember: 11 }, true)).toBe('costMemberHigh')
    })

    it('should handle complex cost objects', () => {
      const cost = { normal: 10, earlyBird: { cost: 8, days: 5 } }
      const costMember = { normal: 10, earlyBird: { cost: 8, days: 5 } }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })

    it('should return costMemberHigh for complex cost objects', () => {
      const cost = { normal: 10, earlyBird: { cost: 8, days: 5 } }
      const costMember = { normal: 10, earlyBird: { cost: 9, days: 5 } }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toEqual({
        key: 'costMemberHigh',
        opts: { field: 'costMember', list: ['earlyBird'] },
      })
    })

    it('should handle breed costs', () => {
      const cost = { normal: 10, breed: { '110': 8 } }
      const costMember = { normal: 10, breed: { '110': 8 } }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })

    it('should return costMemberHigh for breed costs', () => {
      const cost = { normal: 10, breed: { '110': 8 } }
      const costMember = { normal: 10, breed: { '110': 9 } }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toEqual({
        key: 'costMemberHigh',
        opts: { field: 'costMember', list: ['breed[110]'] },
      })
    })

    it('should handle optional additional costs', () => {
      const cost = {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 5, description: { fi: 'Test' } }],
      }
      const costMember = {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 5, description: { fi: 'Test' } }],
      }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })

    it('should return costMemberHigh for optional additional costs', () => {
      const cost = {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 5, description: { fi: 'Test' } }],
      }
      const costMember = {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 6, description: { fi: 'Test' } }],
      }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toEqual({
        key: 'costMemberHigh',
        opts: { field: 'costMember', list: ['optionalAdditionalCosts[0]'] },
      })
    })
  })
})
