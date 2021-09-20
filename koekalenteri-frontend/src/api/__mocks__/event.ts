import { Event } from "koekalenteri-shared/model/Event";

const commonProps = {
  organizer: 'test',
  location: 'test',
  name: 'test',
  description: 'test',
  places: 123,
  entries: 123,
  allowOnlineEntry: true,
  allowOnlinePayment: true,
  unofficial: true,
  allowOwnerMembershipPriority: true,
  allowHandlerMembershipPriority: true,
  cost: 123,
  costMember: 123,
  paymentDetails: 'test',
  accountNumber: 'test',
  referenceNumber: 'test',
  requirePaymentBeforeEntry: true,
  judges: [123],
  official: 123,
  createdAt: 'test',
  createdBy: 'test',
  modifiedAt: 'test',
  modifiedBy: 'test',
}

const mockEvents: Event[] = [
  {
    id: 'test1',
    eventType: 'type1',
    classes: ['class1'],
    startDate: new Date('2021-02-10'),
    endDate: new Date('2021-02-11'),
    entryStartDate: new Date('2021-02-01'),
    entryEndDate: new Date('2021-02-07'),
    ...commonProps
  },
  {
    id: 'test2',
    eventType: 'type2',
    classes: ['class2'],
    startDate: new Date('2021-02-12'),
    endDate: new Date('2021-02-13'),
    entryStartDate: new Date('2021-02-01'),
    entryEndDate: new Date('2021-02-07'),
    ...commonProps
  }
];

export async function getEvents() {
  return new Promise((resolve, reject) => {
    process.nextTick(() => resolve(mockEvents));
  });
}

export async function getEvent(id: string) {
  return new Promise((resolve, reject) => {
    process.nextTick(() => resolve(mockEvents.filter(event => event.id === id)));
  });
}
