import { addDays, startOfDay } from "date-fns";
import { Event } from "koekalenteri-shared/model/Event";

const today = startOfDay(new Date());

const commonProps = {
  organizer: {
    id: 1,
    name: 'Suomen Noutajakoirajärjestö ry'
  },
  location: 'test',
  name: 'test',
  description: 'test',
  places: 10,
  entries: 0,
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
  official: 123,
  createdAt: 'test',
  createdBy: 'test',
  modifiedAt: 'test',
  modifiedBy: 'test',
}

const mockEvents: Event[] = [
  {
    ...commonProps,
    id: 'test1',
    eventType: 'type1',
    classes: ['class1'],
    startDate: new Date('2021-02-10'),
    endDate: new Date('2021-02-11'),
    entryStartDate: new Date('2021-02-01'),
    entryEndDate: new Date('2021-02-07'),
    judges: [123],
  },
  {
    ...commonProps,
    id: 'test2',
    organizer: {
      id: 2,
      name: 'Test org'
    },
    eventType: 'type2',
    classes: ['class2'],
    startDate: new Date('2021-02-12'),
    endDate: new Date('2021-02-13'),
    entryStartDate: new Date('2021-02-01'),
    entryEndDate: new Date('2021-02-12'),
    judges: [223],
  },
  {
    ...commonProps,
    id: 'test3',
    eventType: 'type3',
    classes: ['class3'],
    startDate: addDays(today, 14),
    endDate: addDays(today, 15),
    entryStartDate: today, // entry starts today
    entryEndDate: addDays(today, 8), // over week from today
    judges: [223],
    places: 10,
    entries: 10,
  },
  {
    ...commonProps,
    id: 'test4',
    eventType: 'type4',
    classes: ['class4'],
    startDate: addDays(today, 14),
    endDate: addDays(today, 15),
    entryStartDate: addDays(today, 1), // entry not open yet
    entryEndDate: addDays(today, 8),
    judges: [223],
    places: 10,
    entries: 0,
  },
  {
    ...commonProps,
    id: 'test5',
    eventType: 'type5',
    classes: ['class5'],
    startDate: addDays(today, 24),
    endDate: addDays(today, 25),
    entryStartDate: addDays(today, -1),
    entryEndDate: addDays(today, 6),
    judges: [223],
    places: 10,
    entries: 9,
  },
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
