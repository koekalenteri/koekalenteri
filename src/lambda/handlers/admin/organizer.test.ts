import { genericReadAllTest } from '../../test-utils/genericTests'

// Dynamic to allow mocks (with ESM)
const { getOrganizersHandler } = await import('./organizer')

describe('Test getOrganizersHandler (generic)', genericReadAllTest(getOrganizersHandler))
