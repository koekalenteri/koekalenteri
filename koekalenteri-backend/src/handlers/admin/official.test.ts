import { genericReadAllTest } from '../../test-utils/genericTests'

// Dynamic to allow mocks (with ESM)
const { getOfficialsHandler } = await import('./official')

describe('Test getOfficialsHandler (generic)', genericReadAllTest(getOfficialsHandler))
