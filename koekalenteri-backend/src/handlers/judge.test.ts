import { genericReadAllTest } from '../test-utils/genericTests'

// Dynamic to allow mocks (with ESM)
const { getJudgesHandler } = await import('./judge')

describe('getJudgesHandler (generic)', genericReadAllTest(getJudgesHandler))
