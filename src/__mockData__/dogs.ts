import type { Dog } from '../types'

import { subMonths } from 'date-fns'

import { eventWithStaticDates } from './events'

export const registrationDogAged10MonthsAndNoResults: Dog = {
  regNo: 'TESTDOG-0010',
  breedCode: '110',
  gender: 'M',
  dob: subMonths(eventWithStaticDates.startDate, 10),
  refreshDate: eventWithStaticDates.entryStartDate,
  rfid: '1234567890123456',
  name: 'Dog Name 10',
  titles: 'Dog titles',
  callingName: 'Test',
  sire: {
    name: 'Sire Name',
    titles: 'Sire titles',
  },
  dam: {
    name: 'Dam Name',
    titles: 'Dam titles',
  },
  results: [],
}

export const registrationDogAged20MonthsAndNoResults: Dog = {
  regNo: 'TESTDOG-0020',
  breedCode: '110',
  gender: 'M',
  dob: subMonths(eventWithStaticDates.startDate, 20),
  refreshDate: eventWithStaticDates.entryStartDate,
  rfid: '1234567890123457',
  name: 'Dog Name 20',
  titles: 'Dog titles',
  callingName: 'Test',
  sire: {
    name: 'Sire Name',
    titles: 'Sire titles',
  },
  dam: {
    name: 'Dam Name',
    titles: 'Dam titles',
  },
  results: [],
}

export const registrationDogAged28MonthsWithNOUResult: Dog = {
  regNo: 'TESTDOG-0030',
  breedCode: '110',
  gender: 'M',
  dob: subMonths(eventWithStaticDates.startDate, 28),
  refreshDate: eventWithStaticDates.entryStartDate,
  rfid: '1234567890123457',
  name: 'Dog Name 20',
  titles: 'Dog titles',
  callingName: 'Test',
  sire: {
    name: 'Sire Name',
    titles: 'Sire titles',
  },
  dam: {
    name: 'Dam Name',
    titles: 'Dam titles',
  },
  results: [
    {
      date: subMonths(eventWithStaticDates.startDate, 1),
      location: 'test location',
      type: 'NOU',
      class: '',
      result: 'NOU1',
      judge: 'test judge',
    },
  ],
}
