import { genericQueryTest } from '../test-utils/genericTests'

// Dynamic to allow mocks (with ESM)
const { getStartListHandler } = await import('./startlist')

describe('getStartListHandler (generic)', genericQueryTest(getStartListHandler, [{ group: { date: '2022-01-01' } }]))
