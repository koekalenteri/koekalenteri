import type { Event } from 'koekalenteri-shared/model';

export const DEFAULT_EVENT: Event = {
  accountNumber: '',
  allowHandlerMembershipPriority: true,
  allowOwnerMembershipPriority: true,
  classes: [],
  cost: 0,
  costMember: 0,
  description: '',
  entries: 0,
  eventType: '',
  id: '',
  judges: [],
  location: '',
  name: '',
  official: {
    id: 0,
    name: '',
    email: '',
    phone: '',
    location: '',
    district: '',
    eventTypes: []
  },
  organizer: {
    id: 0,
    name: ''
  },
  secretary: {
    id: 0,
    name: '',
    email: '',
    phone: '',
    location: ''
  },
  paymentDetails: '',
  places: 0,
  referenceNumber: '',
  state: 'draft',
  createdAt: new Date(),
  createdBy: 'unknown',
  modifiedAt: new Date(),
  modifiedBy: 'unknown',
};
