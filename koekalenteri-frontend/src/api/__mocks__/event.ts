import { addDays, parseISO, startOfDay } from 'date-fns';
import { Event, EventEx, Registration } from 'koekalenteri-shared/model';
import { emptyEvent } from '../test-utils/emptyEvent';
import { rehydrateEvent } from '../utils';

const today = startOfDay(new Date());

const mockEvents: EventEx[] = [
  {
    ...emptyEvent,
    id: 'test1',
    eventType: 'type1',
    classes: [{ class: 'class1' }],
    startDate: parseISO('2021-02-10'),
    endDate: parseISO('2021-02-11'),
    entryStartDate: parseISO('2021-02-01'),
    entryEndDate: parseISO('2021-02-07'),
    judges: [123],
    location: 'test location'
  },
  {
    ...emptyEvent,
    id: 'test2',
    organizer: {
      id: 2,
      name: 'Test org'
    },
    eventType: 'NOME-B',
    classes: [{ class: 'AVO' }],
    startDate: parseISO('2021-02-12'),
    endDate: parseISO('2021-02-13'),
    entryStartDate: parseISO('2021-02-01'),
    entryEndDate: parseISO('2021-02-12'),
    judges: [223],
  },
  {
    ...emptyEvent,
    id: 'test3',
    eventType: 'type3',
    classes: [{ class: 'class3' }],
    startDate: addDays(today, 14),
    endDate: addDays(today, 15),
    entryStartDate: today, // entry starts today
    entryEndDate: addDays(today, 8), // over week from today
    judges: [223],
    places: 10,
    entries: 10,
  },
  {
    ...emptyEvent,
    id: 'test4',
    eventType: 'type4',
    classes: [{ class: 'class4' }],
    startDate: addDays(today, 14),
    endDate: addDays(today, 15),
    entryStartDate: addDays(today, 1), // entry not open yet
    entryEndDate: addDays(today, 8),
    judges: [223],
    places: 10,
    entries: 0,
  },
  {
    ...emptyEvent,
    id: 'test5',
    eventType: 'type5',
    classes: [{ class: 'class5' }],
    startDate: addDays(today, 24),
    endDate: addDays(today, 25),
    entryStartDate: addDays(today, -1),
    entryEndDate: addDays(today, 6),
    judges: [223],
    places: 10,
    entries: 9,
  },
].map(event => rehydrateEvent(event));

const mockRegistrations: { [key: string]: Registration[] } = {
  test2: [{
    id: 'reg1',
    createdAt: parseISO('2021-02-01'),
    createdBy: 'some user',
    modifiedAt: parseISO('2021-02-01'),
    modifiedBy: 'some user',
    agreeToPublish: true,
    agreeToTerms: true,
    breeder: {
      name: 'breeder name',
      location: 'breeder location'
    },
    handler: {
      name: 'handler name',
      email: 'handler@e.mail',
      phone: 'phone',
      location: 'handler location',
      membership: false
    },
    owner: {
      name: 'owner name',
      email: 'owner@e.mail',
      phone: 'owner phone',
      location: 'owner location',
      membership: false
    },
    eventId: 'test2',
    eventType: 'NOME-B',
    dates: [],
    language: 'fi',
    notes: 'notes',
    dog: {
      name: 'dog name',
      regNo: 'dog reg',
      results: [],
    },
    qualifyingResults: [],
    reserve: 'ANY'
  }]
};

export async function getEvents(): Promise<EventEx[]> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockEvents));
  });
}

export async function getEvent(eventType: string, id: string): Promise<EventEx> {
  return new Promise((resolve, reject) => {
    const event = mockEvents.find(item => item.eventType === eventType && item.id === id);
    process.nextTick(() => event ? resolve(event) : reject());
  });
}

export async function putEvent(event: Event, token?: string): Promise<EventEx> {
  return new Promise((resolve, reject) => {
    let fullEvent: EventEx | undefined;
    if (event) {
      if (!event.id) {
        event.id = 'test' + (mockEvents.length + 1);
        fullEvent = rehydrateEvent(event);
        mockEvents.push(fullEvent);
      } else {
        fullEvent = mockEvents.find(e => e.id === event.id);
        if (fullEvent) {
          Object.assign(fullEvent, event);
          fullEvent.modifiedAt = new Date();
          fullEvent.modifiedBy = 'mock';
        }
      }
    }
    process.nextTick(() => fullEvent ? resolve(fullEvent) : reject());
  });
}

export async function getRegistrations(eventId: string, _signal?: AbortSignal): Promise<Registration[]> {
  return new Promise((resolve, reject) => {
    const event = mockEvents.find(item => item.id === eventId);
    if (!event) {
      reject();
    } else {
      process.nextTick(() => resolve(mockRegistrations[eventId] || []));
    }
  });
}

export async function getRegistration(eventId: string, id: string, _signal?: AbortSignal): Promise<Registration | undefined> {
  return new Promise((resolve, reject) => {
    const registration = (mockRegistrations[eventId] || []).find(item => item.id === id);
    if (!registration) {
      reject();
    } else {
      process.nextTick(() => resolve(registration));
    }
  });

}
