import type { Dog } from 'koekalenteri-shared/model'

import {
  registrationDogAged10MonthsAndNoResults,
  registrationDogAged20MonthsAndNoResults,
  registrationDogAged28MonthsWithNOUResult,
} from '../../__mockData__/dogs'

const defaultDog = (regNo: string): Dog => ({
  regNo,
  name: 'Test Dog',
  rfid: 'rfid',
  dob: new Date('20220101T00:00:00'),
  gender: 'M',
  breedCode: '121',
  titles: '',
  results: [],
})

const mockDogs: Dog[] = [
  registrationDogAged10MonthsAndNoResults,
  registrationDogAged20MonthsAndNoResults,
  registrationDogAged28MonthsWithNOUResult,
]

export async function getDog(regNo: string, refresh?: boolean, signal?: AbortSignal): Promise<Dog> {
  return new Promise((resolve) => {
    const dog = mockDogs.find((d) => d.regNo === regNo) ?? defaultDog(regNo)
    process.nextTick(() => resolve(dog))
  })
}
