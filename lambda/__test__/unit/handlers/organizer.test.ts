import { getOrganizersHandler } from '../../../src/handlers/organizer';
import { genericReadAllTest } from '../../utils/genericTests';

describe('Test getOrganizersHandler (generic)', genericReadAllTest(getOrganizersHandler));
