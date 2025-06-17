/**
 * Test fixtures for organizers
 */

import type { Organizer } from 'src/types/Organizer'

export const organizers: Organizer[] = [
  {
    id: 'test-org-1',
    name: 'Test Organization 1',
    kcId: 12345,
    active: true,
    paytrailMerchantId: '695874',
  },
  {
    id: 'test-org-2',
    name: 'Test Organization 2',
    kcId: 67890,
    active: true,
    paytrailMerchantId: '695874',
  },
  {
    id: 'test-org-3',
    name: 'Test Organization 3',
    kcId: 54321,
    active: false,
  },
  {
    id: 'test-org-4',
    name: 'Test Organization 4',
    kcId: 98765,
    active: true,
    paytrailMerchantId: '695874',
  },
  {
    id: 'test-org-5',
    name: 'Test Organization 5',
    kcId: 13579,
    active: false,
  },
]
