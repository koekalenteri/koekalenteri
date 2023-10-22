import { genericReadAllTest, genericReadTest } from '../test-utils/genericTests'

// Dynamic to allow mocks (with ESM)
const { getEventHandler, getEventsHandler } = await import('./event')

describe('Test getEventsHandler (generic)', genericReadAllTest(getEventsHandler))

describe('Test getEventHandler (generic)', genericReadTest(getEventHandler))
