import { capitalize, getJudgesHandler } from '../../../src/handlers/judge';
import { genericReadAllTest } from '../../utils/genericTests';

describe('Test getJudgesHandler (generic)', genericReadAllTest(getJudgesHandler));

describe('capitalize', function() {
  it('should capitalize properly', function() {
    expect(capitalize('TEST PERSON')).toEqual('Test Person');
    expect(capitalize('test person-dash')).toEqual('Test Person-Dash');
  });
});
