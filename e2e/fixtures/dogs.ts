import type { JsonDog } from 'src/types'

export const dogs: Record<string, JsonDog> = {
  'NOU/123': {
    regNo: 'NOU/123',
    name: 'Test Dog 123',
    rfid: '123456789012345',
    dob: new Date('2020-01-15').toISOString(),
    gender: 'M',
    breedCode: '121',
    refreshDate: new Date().toISOString(),
    sire: {
      name: 'TEST SIRE 123',
      titles: 'FI KVA',
    },
    dam: {
      name: 'TEST DAM 123',
      titles: '',
    },
    results: [
      {
        date: new Date('2021-07-15').toISOString(),
        location: 'test location',
        type: 'NOU',
        class: '',
        result: 'NOU1',
        judge: 'test judge',
      },
    ],
  },
  'ALO/123': {
    regNo: 'ALO/123',
    name: 'Test Dog 123',
    rfid: '123456789012345',
    dob: new Date('2020-01-15').toISOString(),
    gender: 'M',
    breedCode: '121',
    refreshDate: new Date().toISOString(),
    results: [
      {
        date: new Date('2021-07-15').toISOString(),
        location: 'test location',
        type: 'NOU',
        class: '',
        result: 'NOU1',
        judge: 'test judge',
      },
      {
        date: new Date('2022-06-07').toISOString(),
        location: 'test location',
        type: 'NOME-B',
        class: 'ALO',
        result: 'ALO1',
        judge: 'test judge',
      },
    ],
  },
}
