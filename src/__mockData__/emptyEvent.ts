import type { ConfirmedEvent, JsonDogEvent } from '../types'

import { zonedStartOfDay } from '../i18n/dates'

export const emptyEvent: ConfirmedEvent = {
  classes: [{ class: 'ALO', date: zonedStartOfDay('1990-01-01') }],
  contactInfo: {
    official: {
      name: 'Teemu Toimitsija',
      email: 'official@example.com',
      phone: '040-official',
    },
    secretary: {
      name: 'Siiri Sihteeri',
      email: 'secretary@example.com',
      phone: '040-secretary',
    },
  },
  cost: 123,
  costMember: 123,
  createdAt: zonedStartOfDay('1989-01-01'),
  createdBy: 'test',
  description: 'test',
  endDate: zonedStartOfDay('1990-01-01'),
  entries: 0,
  entryEndDate: zonedStartOfDay('1990-01-01'),
  entryStartDate: zonedStartOfDay('1990-01-01'),
  eventType: 'test',
  headquarters: { zipCode: '33101' },
  id: 'test',
  judges: [{ id: 123, name: 'Tuomari 1', official: true }],
  kcId: 123456,
  location: 'test',
  modifiedAt: zonedStartOfDay('1989-01-02'),
  modifiedBy: 'test',
  name: 'test',
  official: {
    id: '1',
    name: 'Teemu Toimitsija',
  },
  priority: ['member'],
  secretary: {
    id: '2',
    name: 'Siiri Sihteeri',
  },
  organizer: {
    id: '1',
    name: 'Suomen Noutajakoirajärjestö ry',
  },
  places: 10,
  startDate: zonedStartOfDay('1990-01-01'),
  state: 'confirmed' as const,
}

export const jsonEmptyEvent: JsonDogEvent = JSON.parse(JSON.stringify(emptyEvent))
