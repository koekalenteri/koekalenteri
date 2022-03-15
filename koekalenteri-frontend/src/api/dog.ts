import { Dog, JsonDog, TestResult } from 'koekalenteri-shared/model';
import http from './http';
import { toDate } from './utils';

const PATH = '/dog/';

export function rehydrateDog(dog: JsonDog): Dog {
  return {
    ...dog,
    dob: toDate(dog.dob),
    refreshDate: toDate(dog.refreshDate),
    results: dog.results?.map<TestResult>(r => ({...r, date: new Date(r.date)}))
  };
}

export async function getDog(regNo: string, refresh?: boolean, signal?: AbortSignal): Promise<Dog> {
  const encodedRegNo = regNo.replace('/', '~');
  const qs = refresh ? '?refresh' : '';
  return rehydrateDog(await http.get<JsonDog>(`${PATH}${encodedRegNo}${qs}`, {signal}));
}
