import { genericReadAllTest } from '../../test-utils/genericTests'

import { getOrganizersHandler } from './organizer'

describe('Test getOrganizersHandler (generic)', genericReadAllTest(getOrganizersHandler))
