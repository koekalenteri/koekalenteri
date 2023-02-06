import { genericReadAllTest } from '../test-utils/genericTests'

import { getOfficialsHandler } from './official'

describe('Test getOfficialsHandler (generic)', genericReadAllTest(getOfficialsHandler))
