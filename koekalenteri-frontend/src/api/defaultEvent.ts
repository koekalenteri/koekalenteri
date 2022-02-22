import type { Event } from 'koekalenteri-shared/model';

export const DEFAULT_EVENT: Event = {
  accountNumber: '',
  allowHandlerMembershipPriority: true,
  allowOwnerMembershipPriority: true,
  classes: [],
  cost: 0,
  costMember: 0,
  createdAt: new Date('1989-01-01'),
  createdBy: '',
  description: '',
  endDate: new Date('1990-01-01'),
  entries: 0,
  entryEndDate: new Date('1990-01-01'),
  entryStartDate: new Date('1990-01-01'),
  eventType: '',
  id: '',
  judges: [],
  location: '',
  modifiedAt: new Date('1989-01-02'),
  modifiedBy: '',
  name: '',
  official: {
    id: 0,
    name: '',
    email: '',
    phone: '',
    location: '',
    eventTypes: []
  },
  secretary: {
    id: 0,
    name: '',
    email: '',
    phone: '',
    location: ''
  },
  organizer: {
    id: 0,
    name: ''
  },
  paymentDetails: '',
  places: 0,
  referenceNumber: '',
  startDate: new Date('1990-01-01'),
  state: 'draft'
};
