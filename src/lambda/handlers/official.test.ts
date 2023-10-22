import { genericReadAllTest } from '../test-utils/genericTests'

// Dynamic to allow mocks (with ESM)
const { getOfficialsHandler } = await import('./official')

describe('getJudgesHandler (generic)', genericReadAllTest(getOfficialsHandler))
