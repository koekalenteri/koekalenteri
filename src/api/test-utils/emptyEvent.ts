import type { ConfirmedEvent } from '../../types'

export const emptyEvent: ConfirmedEvent = {
  classes: [{ class: 'ALO' }],
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
  createdAt: new Date('1989-01-01'),
  createdBy: 'test',
  description: 'test',
  endDate: new Date('1990-01-01'),
  entries: 0,
  entryEndDate: new Date('1990-01-01'),
  entryStartDate: new Date('1990-01-01'),
  eventType: 'test',
  id: 'test',
  judges: [123],
  kcId: 123456,
  location: 'test',
  modifiedAt: new Date('1989-01-02'),
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
  startDate: new Date('1990-01-01'),
  state: 'confirmed' as const,
}
