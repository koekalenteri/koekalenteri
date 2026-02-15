import type { Dog } from '../../types'
import {
  registrationDogAged10MonthsAndNoResults,
  registrationDogAged20MonthsAndNoResults,
  registrationDogAged28MonthsWithNOUResult,
} from '../../__mockData__/dogs'

const defaultDog = (regNo: string): Dog => ({
  breedCode: '121',
  dob: new Date('20220101T00:00:00'),
  gender: 'M',
  name: 'Test Dog',
  regNo,
  results: [],
  rfid: 'rfid',
  titles: '',
})

const mockDogs: Dog[] = [
  registrationDogAged10MonthsAndNoResults,
  registrationDogAged20MonthsAndNoResults,
  registrationDogAged28MonthsWithNOUResult,
]

export async function getDog(regNo: string, _refresh?: boolean, _signal?: AbortSignal): Promise<Dog> {
  return new Promise((resolve) => {
    const dog = mockDogs.find((d) => d.regNo === regNo) ?? defaultDog(regNo)
    process.nextTick(() => resolve(dog))
  })
}
