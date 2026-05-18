import type { JsonConfirmedEvent } from '../../types'
import { jsonEmptyEvent } from '../../__mockData__/emptyEvent'

export const createEvent = (overrides: Partial<JsonConfirmedEvent> = {}): JsonConfirmedEvent => ({
  ...jsonEmptyEvent,
  contactInfo: {
    official: { email: 'official@example.com', name: 'Official' },
    secretary: { email: 'secretary@example.com', name: 'Secretary' },
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  createdBy: 'test-user',
  description: '',
  endDate: '2025-01-02',
  entries: 0,
  entryEndDate: '2025-01-01',
  entryStartDate: '2024-12-01',
  eventType: 'Test Type',
  id: 'event123',
  judges: [],
  location: 'Test Location',
  modifiedAt: '2025-01-01T00:00:00.000Z',
  modifiedBy: 'test-user',
  name: 'Test Event',
  official: { email: 'official@example.com', name: 'Official' },
  organizer: { id: 'org123', name: 'Test Organizer' },
  places: 10,
  season: '2025',
  secretary: { email: 'secretary@example.com', name: 'Secretary' },
  startDate: '2025-01-01',
  state: 'confirmed',
  ...overrides,
})
