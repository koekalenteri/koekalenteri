import { Dog } from 'koekalenteri-shared/model';
import http from './http';

const PATH = '/dog/';

export function rehydrateDog(dog: Dog): Dog {
  if (dog.dob) {
    dog.dob = new Date(dog.dob);
  }
  if (dog.refreshDate) {
    dog.refreshDate = new Date(dog.refreshDate);
  }
  return dog;
}

export async function getDog(regNo: string, refresh?: boolean, signal?: AbortSignal): Promise<Dog> {
  const encodedRegNo = regNo.replace('/', '~');
  const qs = refresh ? '?refresh' : '';
  return rehydrateDog(await http.get<Dog>(`${PATH}${encodedRegNo}${qs}`, {signal}));
}
