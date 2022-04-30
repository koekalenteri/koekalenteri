import type { Event } from 'koekalenteri-shared/model';

export const emptyEvent: Event = {
  accountNumber: 'test',
  allowHandlerMembershipPriority: true,
  allowOwnerMembershipPriority: true,
  classes: [{ class: 'test' }],
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
  location: 'test',
  modifiedAt: new Date('1989-01-02'),
  modifiedBy: 'test',
  name: 'test',
  official: {
    id: 1,
    name: 'Teemu Toimitsija',
    email: 'joo@ei.com',
    phone: '040-official',
    location: 'Suomi',
    district: 'Helsinki',
    eventTypes: ['test']
  },
  secretary: {
    id: 2,
    name: 'Siiri Sihteeri',
    email: 'ei@joo.com',
    phone: '040-secretary',
    location: 'Ruotsi'
  },
  organizer: {
    id: 1,
    name: 'Suomen Noutajakoirajärjestö ry'
  },
  paymentDetails: 'test',
  places: 10,
  referenceNumber: 'test',
  startDate: new Date('1990-01-01'),
  state: 'confirmed'
}
