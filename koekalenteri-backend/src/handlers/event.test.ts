import { genericReadAllTest, genericReadTest } from '../test-utils/genericTests'

import { getEventHandler, getEventsHandler } from './event'

describe('Test getEventsHandler (generic)', genericReadAllTest(getEventsHandler))
describe('Test getEventHandler (generic)', genericReadTest(getEventHandler))
