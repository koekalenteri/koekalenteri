import { getEventsHandler, getEventHandler, putEventHandler } from '../../../src/handlers/event';
import { genericReadAllTest, genericReadTest, genericWriteTest } from '../../utils/genericTests';

describe('Test getEventsHandler (generic)', genericReadAllTest(getEventsHandler));
describe('Test getEventHandler (generic)', genericReadTest(getEventHandler));
describe('Test putEventHandler (generic)', genericWriteTest(putEventHandler));
