import { Event, EventEx, JsonEvent, JsonRegistration, QualifyingResult, Registration, RegistrationDate } from 'koekalenteri-shared/model';
import { rehydrateDog } from './dog';
import http from './http';
import { rehydrateEvent } from './utils';

const PATH = '/event/';

export async function getEvents(signal?: AbortSignal): Promise<EventEx[]> {
  const jsonEvents = await http.get<Array<JsonEvent>>(PATH, {signal});
  return jsonEvents.map(item => rehydrateEvent(item));
}

export async function getEvent(eventType: string, id: string, signal?: AbortSignal): Promise<EventEx> {
  const jsonEvent = await http.get<JsonEvent>(`${PATH}${eventType}/${id}`, {signal});
  return rehydrateEvent(jsonEvent);
}

export async function putEvent(event: Partial<Event>): Promise<EventEx> {
  return rehydrateEvent(await http.post<Partial<Event>, JsonEvent>(PATH, event));
}

export async function getRegistrations(eventId: string, signal?: AbortSignal): Promise<Registration[]> {
  const jsonRegistrations = await http.get<Array<JsonRegistration>>(`/registration/${eventId}`, {signal})
  return jsonRegistrations.map(item => rehydrateRegistration(item));
}

export async function getRegistration(eventId: string, id: string, signal?: AbortSignal): Promise<Registration | undefined> {
  return rehydrateRegistration(await http.get<JsonRegistration>(`/registration/${eventId}/${id}`, {signal}));
}

export async function putRegistration(registration: Registration): Promise<Registration> {
  return rehydrateRegistration(await http.post<Registration, JsonRegistration>(PATH + 'register/', registration));
}

export function rehydrateRegistration(json: JsonRegistration): Registration {
  return {
    ...json,
    createdAt: new Date(json.createdAt),
    dates: json.dates?.map<RegistrationDate>(d => ({ ...d, date: new Date(d.date) })),
    deletedAt: json.deletedAt ? new Date(json.deletedAt) : undefined,
    dog: rehydrateDog(json.dog),
    modifiedAt: new Date(json.modifiedAt),
    qualifyingResults: json.qualifyingResults.map<QualifyingResult>(r => ({ ...r, date: new Date(r.date) })),
    results: json.results?.map(r => ({ ...r, date: new Date(r.date), official: false })),
  };
}
