import type { ConfirmedEvent, JsonDogEvent } from '../types'

export const emptyEvent: ConfirmedEvent = {
  classes: [{ class: 'ALO', date: new Date('1990-01-01') }],
  contactInfo: {
    official: {
      email: 'official@example.com',
      name: 'Teemu Toimitsija',
      phone: '040-official',
    },
    secretary: {
      email: 'secretary@example.com',
      name: 'Siiri Sihteeri',
      phone: '040-secretary',
    },
  },
  cost: 123,
  costMember: 123,
  createdAt: new Date('1989-01-01'),
  createdBy: 'test',
  description: 'test',
  endDate: new Date('1990-01-01'),
  entries: 0,
  entryEndDate: new Date('1990-01-01'),
  entryStartDate: new Date('1990-01-01'),
  eventType: 'test',
  headquarters: { zipCode: '33101' },
  id: 'test',
  judges: [{ id: 123, name: 'Tuomari 1', official: true }],
  kcId: 123456,
  location: 'test',
  modifiedAt: new Date('1989-01-02'),
  modifiedBy: 'test',
  name: 'test',
  official: {
    id: '1',
    name: 'Teemu Toimitsija',
  },
  organizer: {
    id: '1',
    name: 'Suomen Noutajakoirajärjestö ry',
  },
  places: 10,
  priority: ['member'],
  secretary: {
    id: '2',
    name: 'Siiri Sihteeri',
  },
  startDate: new Date('1990-01-01'),
  state: 'confirmed' as const,
}

export const jsonEmptyEvent: JsonDogEvent = JSON.parse(JSON.stringify(emptyEvent))
