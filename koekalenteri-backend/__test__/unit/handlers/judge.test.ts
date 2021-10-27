import { getJudgesHandler } from '../../../src/handlers/judge';
import { genericReadAllTest } from '../../utils/genericTests';

describe('Test getJudgesHandler (generic)', genericReadAllTest(getJudgesHandler));
