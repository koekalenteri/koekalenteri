import { genericReadAllTest } from '../test-utils/genericTests'
import { capitalize } from '../utils/string'

import { getJudgesHandler } from './judge'

describe('Test getJudgesHandler (generic)', genericReadAllTest(getJudgesHandler))

describe('capitalize', function () {
  it('should capitalize properly', function () {
    expect(capitalize('TEST PERSON')).toEqual('Test Person')
    expect(capitalize('test person-dash')).toEqual('Test Person-Dash')
  })
})
