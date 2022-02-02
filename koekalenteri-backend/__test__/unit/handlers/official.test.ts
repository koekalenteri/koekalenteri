import { getOfficialsHandler } from '../../../src/handlers/official';
import { genericReadAllTest } from '../../utils/genericTests';

describe('Test getOfficialsHandler (generic)', genericReadAllTest(getOfficialsHandler));
