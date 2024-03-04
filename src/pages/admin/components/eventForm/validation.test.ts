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
})
